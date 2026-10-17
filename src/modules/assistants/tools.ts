import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AccessDenied, currentTenant } from "@/modules/auth";
import { assertSandboxBookingApproval, ComplianceError } from "@/modules/compliance";
import { readAssistantCatalogInTransaction } from "@/modules/services";
import { availabilityInTransaction, availabilityReasons, AvailabilityError } from "@/modules/availability";
import { createBookingInTransaction, readBookingReceiptInTransaction, BookingError } from "@/modules/bookings";
import { assistantInput, PLAYBOOK_VERSION } from "./domain";
import { ToolError, toolContextId, toolRequest, type ToolResult } from "./tools-domain";
async function owner(organizationId: string) {
  const context = await currentTenant(organizationId);
  if (context.role !== "OPERATOR_OWNER") throw new AccessDenied();
  return context;
}
async function lock(tx: Prisma.TransactionClient, context: Awaited<ReturnType<typeof owner>>) {
  await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
  const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actorId } }, include: { user: { select: { active: true } } } });
  if (!member?.active || !member.user.active || member.role !== "OPERATOR_OWNER") throw new AccessDenied();
}
export async function startAssistantSession(organizationId: string) {
  const context = await owner(organizationId);
  return getDb().$transaction(async tx => {
    await lock(tx, context); await assertSandboxBookingApproval(tx, context.organizationId);
    const profile = await tx.assistantProfile.findUnique({ where: { organizationId: context.organizationId } });
    const version = profile && await tx.assistantVersion.findUnique({ where: { organizationId_version: { organizationId: context.organizationId, version: profile.version } } });
    if (!profile || version?.playbookVersion !== PLAYBOOK_VERSION) throw new ToolError("CORE_OUTDATED", "Prepare e guarde a configuração atual da assistente antes de iniciar os testes.");
    if (await tx.assistantConversation.count({ where: { organizationId: context.organizationId } }) >= 500) throw new ToolError("LIMIT_REACHED", "Limite de 500 sessões atingido. Contacte a administração.");
    const now = new Date();
    const conversation = await tx.assistantConversation.create({ data: { organizationId: context.organizationId, actorId: context.actorId, assistantVersion: profile.version, createdAt: now, expiresAt: new Date(now.valueOf() + 24 * 3600000) } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "assistant.session_started", metadata: { conversationId: conversation.id, assistantVersion: profile.version, mode: "SANDBOX" } } });
    return conversation.id;
  });
}
export async function readAssistantSession(organizationId: string, conversationId: string) {
  const context = await owner(organizationId); toolContextId.parse(conversationId);
  const session = await getDb().assistantConversation.findFirst({ where: { id: conversationId, organizationId: context.organizationId, actorId: context.actorId }, select: { id: true, assistantVersion: true, expiresAt: true, assistant: { select: { configuration: true } } } });
  if (!session) throw new AccessDenied();
  return { id: session.id, assistantVersion: session.assistantVersion, expiresAt: session.expiresAt, languages: assistantInput.parse(session.assistant.configuration).languages };
}
export async function readAssistantHandoffs(organizationId: string) {
  const context = await owner(organizationId);
  // Internal owner queue only: reasons may contain private customer reference data.
  return getDb().assistantHandoff.findMany({ where: { organizationId: context.organizationId }, select: { id: true, reason: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
}
/** Context is supplied by the authenticated server adapter, never by tool input. No public endpoint. */
export async function executeAssistantTool(organizationId: string, conversationId: string, callId: string, raw: unknown): Promise<ToolResult> {
  const context = await owner(organizationId);
  try {
    toolContextId.parse(conversationId); toolContextId.parse(callId); const request = toolRequest.parse(raw);
    return await getDb().$transaction(async tx => {
      await lock(tx, context);
      const session = await tx.assistantConversation.findFirst({ where: { id: conversationId, organizationId: context.organizationId, actorId: context.actorId }, include: { assistant: { select: { configuration: true, playbookVersion: true } } } });
      if (!session) throw new AccessDenied();
      if (session.expiresAt <= new Date()) throw new ToolError("SESSION_EXPIRED", "A sessão expirou. Inicie outra sessão de teste.");
      if (!["handoff_to_human", "get_booking"].includes(request.tool)) {
        await assertSandboxBookingApproval(tx, context.organizationId);
        const profile = await tx.assistantProfile.findUniqueOrThrow({ where: { organizationId: context.organizationId } });
        if (profile.version !== session.assistantVersion || session.assistant.playbookVersion !== PLAYBOOK_VERSION) throw new ToolError("CONFIGURATION_CHANGED", "A configuração mudou. Inicie outra sessão de teste.");
      }
      const configuration = assistantInput.parse(session.assistant.configuration);
      if ((request.tool === "create_booking" || request.tool === "check_availability") && !configuration.languages.includes(request.input.language)) throw new ToolError("LANGUAGE_DISABLED", "O idioma não está configurado para esta assistente.");
      const success = (message: string, data: Omit<ToolResult, "success" | "mode" | "message"> = {}): ToolResult => ({ success: true, mode: "SANDBOX", message, ...data });
      if (request.tool === "get_services") { const catalog = await readAssistantCatalogInTransaction(tx, context.organizationId, request.input.page); return success("Catálogo atual consultado.", { services: { ...catalog, items: catalog.items.map(({ id, version, name, basePriceCents, currency, pricingType, languages }) => ({ id, version, name, basePriceCents, currency, pricingType, languages })) } }); }
      if (request.tool === "get_service_details") {
        const service = (await readAssistantCatalogInTransaction(tx, context.organizationId, 1, request.input.serviceId)).items[0];
        if (!service) throw new ToolError("SERVICE_NOT_FOUND", "Serviço inexistente ou inativo neste operador.");
        return success("Detalhes atuais consultados.", { service });
      }
      if (request.tool === "check_availability") {
        const result = await availabilityInTransaction(tx, context.organizationId, request.input);
        return success(availabilityReasons[result.reason], { availability: { available: result.available, reason: result.reason, checkedAt: result.checkedAt, timeZone: result.timeZone, startsAt: result.startsAt, endsAt: result.endsAt, alternatives: result.alternatives, reservationConfirmed: false } });
      }
      if (request.tool === "get_booking") {
        const grant = await tx.assistantToolCall.findFirst({ where: { conversationId, organizationId: context.organizationId, tool: "create_booking", bookingId: request.input.bookingId } });
        if (!grant) throw new ToolError("BOOKING_NOT_FOUND", "Reserva não encontrada nesta sessão.");
        return success("Estado atual da reserva consultado.", { booking: await readBookingReceiptInTransaction(tx, context.organizationId, request.input.bookingId) });
      }
      const hash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      const previous = await tx.assistantToolCall.findUnique({ where: { conversationId_callId: { conversationId, callId } } });
      if (previous && previous.requestHash !== hash) throw new ToolError("IDEMPOTENCY_CONFLICT", "Este pedido já foi utilizado com dados diferentes. Inicie um novo pedido.");
      if (!previous && await tx.assistantToolCall.count({ where: { conversationId, organizationId: context.organizationId } }) >= 100) throw new ToolError("LIMIT_REACHED", "Limite de 100 pedidos gravados nesta sessão.");
      if (request.tool === "create_booking") {
        if (!previous) {
          const current = (await readAssistantCatalogInTransaction(tx, context.organizationId, 1, request.input.serviceId)).items[0];
          if (!current || current.version !== request.input.serviceVersion) throw new ToolError("SERVICE_CHANGED", "O serviço ou as condições mudaram. Consulte os detalhes atuais e inicie um novo pedido.");
        }
        const { serviceVersion, ...bookingInput } = request.input; void serviceVersion;
        const booking = previous?.bookingId ? { id: previous.bookingId } : await createBookingInTransaction(tx, context, { ...bookingInput, idempotencyKey: randomUUID(), source: "ASSISTANT_SANDBOX", notes: "" });
        if (!previous) {
          await tx.assistantToolCall.create({ data: { conversationId, organizationId: context.organizationId, callId, tool: request.tool, requestHash: hash, bookingId: booking.id } });
          await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "assistant.booking_created", metadata: { conversationId, bookingId: booking.id, mode: "SANDBOX" } } });
        }
        return success(previous ? "Pedido já registado; estado atual consultado." : "Reserva criada em teste.", { booking: await readBookingReceiptInTransaction(tx, context.organizationId, booking.id), replayed: Boolean(previous) });
      }
      let handoff = await tx.assistantHandoff.findUnique({ where: { conversationId } });
      if (!handoff) handoff = await tx.assistantHandoff.create({ data: { conversationId, organizationId: context.organizationId, reason: request.input.reason } });
      if (!previous) {
        await tx.assistantToolCall.create({ data: { conversationId, organizationId: context.organizationId, callId, tool: request.tool, requestHash: hash } });
        await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "assistant.handoff_registered", metadata: { conversationId, handoffId: handoff.id, mode: "SANDBOX", notificationSent: false } } });
      }
      return success("Pedido de atendimento humano registado na fila interna. Nenhuma mensagem foi enviada.", { handoff: { id: handoff.id, status: "OPEN", notificationSent: false }, replayed: Boolean(previous) });
    }, { isolationLevel: "ReadCommitted", timeout: 10000 });
  } catch (error) {
    if (error instanceof AccessDenied) throw error;
    if (error instanceof ToolError) return { success: false, mode: "SANDBOX", code: error.code, message: error.message };
    if (error instanceof ZodError) return { success: false, mode: "SANDBOX", code: "INVALID_INPUT", message: "Verifique os campos. O pedido contém dados inválidos ou campos não permitidos." };
    if (error instanceof BookingError || error instanceof AvailabilityError || error instanceof ComplianceError) return { success: false, mode: "SANDBOX", code: "OPERATION_REJECTED", message: error.message };
    return { success: false, mode: "SANDBOX", code: "INTERNAL_ERROR", message: "Não foi possível executar o pedido. Não confirme a operação; tente novamente com o mesmo pedido ou peça ajuda humana." };
  }
}
