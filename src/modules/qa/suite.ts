import "server-only";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { Prisma } from "@/generated/prisma/client";
import { startAssistantSessionInTransaction, executeAssistantToolInTransaction, assistantToolFailure, assistantInput, PLAYBOOK_VERSION, type ToolResult } from "@/modules/assistants";
import { availabilityInTransaction } from "@/modules/availability";
import { qaCases, qaCheck, type QaCase, type QaCheck } from "./domain";
import { qaSnapshot } from "./snapshot";

/** Caller always rolls back this transaction, including successful probes and their audits. */
export async function runSuite(tx: Prisma.TransactionClient, context: { organizationId: string; actorId: string }, snapshot: Awaited<ReturnType<typeof qaSnapshot>>) {
  const checks: QaCheck[] = Object.keys(qaCases).map(key => qaCheck.parse({ key, status: "BLOCKED", detail: "Depende da preparação dos dados ou de uma etapa anterior." }));
  const check = (key: QaCase, ok: boolean, detail = "Contrato verificado no servidor.") => { const item = checks.find(item => item.key === key)!; item.status = ok ? "PASS" : "FAIL"; item.detail = ok ? detail : "Verifique a configuração ou o contrato indicado antes de repetir."; };
  checks.find(item => item.key === "CONVERSATIONS")!.detail = "A aplicação ainda não integra conversas de IA. Não avaliado; produção e validação do cliente continuam bloqueadas.";
  const { organization, assistant } = snapshot, config = assistantInput.safeParse(assistant?.configuration);
  check("DOCUMENTS", true); check("BRAND", Boolean(organization.brand)); check("ASSISTANT", config.success && assistant?.playbookVersion === PLAYBOOK_VERSION);
  check("HOURS", config.success && Boolean(config.data.openingHours)); check("POLICIES", config.success && Boolean(config.data.policies)); check("FAQ", config.success && Boolean(config.data.faqs));
  check("ESCALATION", config.success && Boolean(config.data.escalationName && (config.data.escalationEmail || config.data.escalationPhone)));
  check("SERVICES", organization.services.length > 0);
  check("RESOURCES", organization.vehicles.length > 0 && organization.drivers.some(driver => driver.user?.active && driver.user.memberships.some(member => member.active && member.role === "DRIVER")));
  async function protectedWork<T>(work: () => Promise<T>): Promise<{ value: T; error?: never } | { value?: never; error: ToolResult }> {
    await tx.$executeRaw`SAVEPOINT qa_step`;
    try { const value = await work(); await tx.$executeRaw`RELEASE SAVEPOINT qa_step`; return { value }; }
    catch (error) { await tx.$executeRaw`ROLLBACK TO SAVEPOINT qa_step`; await tx.$executeRaw`RELEASE SAVEPOINT qa_step`; return { error: assistantToolFailure(error) }; }
  }
  const started = await protectedWork(() => startAssistantSessionInTransaction(tx, context));
  if (started.error || !config.success) return checks;
  const sessionId = started.value;
  const probe = async (tool: string, input: unknown, callId = randomUUID(), session = sessionId) => { const result = await protectedWork(() => executeAssistantToolInTransaction(tx, context, session, callId, { tool, input })); return result.error ?? result.value; };
  const catalog = await probe("get_services", { page: 1 });
  check("CATALOG", catalog.success && catalog.services?.total === organization.services.length);
  const service = organization.services[0];
  if (!service) return checks;
  const details = await probe("get_service_details", { serviceId: service.id });
  check("DETAILS", details.success && details.service?.basePriceCents === service.basePriceCents && details.service?.version === service.version);
  check("SERVICE_SCOPE", (await probe("get_service_details", { serviceId: randomUUID() })).code === "SERVICE_NOT_FOUND");
  check("BOOKING_SCOPE", (await probe("get_booking", { bookingId: randomUUID() })).code === "BOOKING_NOT_FOUND");
  const tomorrow = Temporal.Now.plainDateISO(organization.timeZone).add({ days: 1 });
  const language = config.data.languages.find(language => service.languages.includes(language)) ?? config.data.languages[0]!;
  const base = { serviceId: service.id, date: tomorrow.toString(), time: "10:00", passengers: 1, language };
  const customer = { serviceVersion: service.version, customerName: "Cliente de QA temporário", customerEmail: "qa-sandbox@example.test", customerPhone: "+351000000000", pickup: "" };
  check("TENANT_OVERRIDE", (await probe("get_services", { organizationId: "untrusted-tenant" })).code === "INVALID_INPUT");
  check("PRICE_OVERRIDE", (await probe("create_booking", { ...base, ...customer, totalPriceCents: 1 })).code === "INVALID_INPUT");
  check("SQL_OVERRIDE", (await probe("get_services", { sql: "SELECT private_data" })).code === "INVALID_INPUT");
  check("DISCOUNT", (await probe("create_booking", { ...base, ...customer, discount: 50 })).code === "INVALID_INPUT");
  check("CANCEL", (await probe("cancel_booking", { bookingId: randomUUID() })).code === "INVALID_INPUT");
  check("BAD_DATE", (await probe("check_availability", { ...base, date: "2026-02-30" })).code === "INVALID_INPUT");
  check("BAD_LANGUAGE", (await probe("check_availability", { ...base, language: "fr" })).code === "INVALID_INPUT");
  const capacity = await probe("check_availability", { ...base, passengers: service.capacity + 1 });
  check("CAPACITY", capacity.code === "INVALID_INPUT" || capacity.availability?.reason === "CAPACITY_EXCEEDED");
  check("STALE_SERVICE", (await probe("create_booking", { ...base, ...customer, serviceVersion: service.version + 1 })).code === "SERVICE_CHANGED");
  const handoffKey = randomUUID(), first = await probe("handoff_to_human", { reason: "Teste QA temporário: pedido de ajuda humana." }, handoffKey);
  check("HANDOFF", first.success && first.handoff?.status === "OPEN" && first.handoff.notificationSent === false);
  const second = await probe("handoff_to_human", { reason: "Teste QA temporário: pedido de ajuda humana." }, handoffKey);
  check("HANDOFF_REPLAY", second.success && second.replayed === true && second.handoff?.id === first.handoff?.id);
  let selected: typeof base | null = null;
  let attempts = 0;
  for (let offset = 0; offset < 30 && !selected && attempts < 32; offset++) {
    const day = tomorrow.add({ days: offset });
    for (const schedule of organization.serviceSchedules.filter(row => row.serviceId === service.id && row.weekday === day.dayOfWeek)) {
      if (attempts++ >= 32) break;
      const query = { ...base, date: day.toString(), time: `${String(Math.floor(schedule.departureMinutes / 60)).padStart(2, "0")}:${String(schedule.departureMinutes % 60).padStart(2, "0")}` };
      const available = await probe("check_availability", query);
      if (available.availability?.available) { selected = query; break; }
    }
  }
  check("SLOT", Boolean(selected), "Saída elegível encontrada nos próximos 30 dias (até 32 consultas).");
  if (!selected) { checks.find(item => item.key === "SLOT")!.detail = "Sem saída elegível na amostra dos próximos 30 dias. Configure agenda/recursos e repita."; return checks; }
  const bookingsBefore = await tx.booking.count({ where: { organizationId: context.organizationId } });
  const available = await probe("check_availability", selected);
  check("NO_CONFIRM", available.success && available.availability?.reservationConfirmed === false && await tx.booking.count({ where: { organizationId: context.organizationId } }) === bookingsBefore);
  const before = await availabilityInTransaction(tx, context.organizationId, selected);
  const key = randomUUID(), input = { ...selected, ...customer }, created = await probe("create_booking", input, key);
  check("CREATE", created.success && created.booking?.status === "CONFIRMED" && created.booking.mode === "SANDBOX");
  if (!created.booking) return checks;
  check("PRICE", created.booking.totalPriceCents === service.basePriceCents * (service.pricingType === "PER_PERSON" ? selected.passengers : 1));
  const after = await availabilityInTransaction(tx, context.organizationId, selected);
  check("OCCUPANCY", after.eligibleVehicles.length < before.eligibleVehicles.length && after.eligibleDrivers.length < before.eligibleDrivers.length);
  const replay = await probe("create_booking", input, key);
  check("REPLAY", replay.success && replay.replayed === true && replay.booking?.id === created.booking.id && await tx.booking.count({ where: { organizationId: context.organizationId } }) === bookingsBefore + 1);
  check("CONFLICT", (await probe("create_booking", { ...input, customerName: "Outro pedido QA" }, key)).code === "IDEMPOTENCY_CONFLICT");
  const another = await protectedWork(() => startAssistantSessionInTransaction(tx, context));
  if (another.value) check("SESSION_SCOPE", (await probe("get_booking", { bookingId: created.booking.id }, randomUUID(), another.value)).code === "BOOKING_NOT_FOUND");
  const receipt = await probe("get_booking", { bookingId: created.booking.id });
  check("PRIVACY", receipt.success && receipt.booking?.id === created.booking.id && !JSON.stringify(receipt).includes(customer.customerEmail) && !JSON.stringify(receipt).includes(customer.customerPhone));
  return checks;
}
