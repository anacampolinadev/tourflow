import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AccessDenied, currentTenant } from "@/modules/auth";
import { assertSandboxBookingApproval } from "@/modules/compliance";
import { recordVersion } from "@/modules/tenants";
import { assistantInput, AssistantError, composeAssistantInstructions, MAX_ASSISTANT_VERSIONS, PLAYBOOK_VERSION, type AssistantInput } from "./domain";

async function owner(organizationId: string) {
  const context = await currentTenant(organizationId);
  if (context.role !== "OPERATOR_OWNER") throw new AccessDenied();
  return context;
}
async function lock(tx: Prisma.TransactionClient, context: Awaited<ReturnType<typeof owner>>) {
  await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
  const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actorId } }, include: { user: { select: { active: true } } } });
  if (!member?.active || member.role !== "OPERATOR_OWNER" || !member.user.active) throw new AccessDenied();
  await assertSandboxBookingApproval(tx, context.organizationId);
}
function snapshot(input: AssistantInput, version: number) {
  return { version, configuration: input, instructions: composeAssistantInstructions(input), playbookVersion: PLAYBOOK_VERSION };
}
export async function initializeAssistant(organizationId: string) {
  const context = await owner(organizationId);
  return getDb().$transaction(async tx => {
    await lock(tx, context);
    const existing = await tx.assistantProfile.findUnique({ where: { organizationId: context.organizationId } });
    if (existing) return existing.version;
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { name: true, brand: { select: { displayName: true } }, operator: { select: { primaryLanguage: true } } } });
    const input = assistantInput.parse({ operatorName: (organization.brand?.displayName ?? organization.name).slice(0, 80), assistantName: "Alana", tone: "WARM", languages: [organization.operator?.primaryLanguage ?? "pt"], openingHours: "", policies: "", faqs: "", escalationName: "", escalationEmail: "", escalationPhone: "" });
    await tx.assistantProfile.create({ data: { organizationId: context.organizationId, version: 1, versions: { create: snapshot(input, 1) } } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "assistant.initialized", metadata: { version: 1, playbookVersion: PLAYBOOK_VERSION, mode: "SANDBOX" } } });
    return 1;
  });
}
export async function updateAssistant(organizationId: string, version: number, raw: unknown) {
  const context = await owner(organizationId);
  recordVersion.parse(version); const input = assistantInput.parse(raw);
  return getDb().$transaction(async tx => {
    await lock(tx, context);
    const profile = await tx.assistantProfile.findUnique({ where: { organizationId: context.organizationId } });
    if (!profile || profile.version !== version) throw new AssistantError("A configuração mudou ou ainda não foi criada. Atualize a página.");
    if (version >= MAX_ASSISTANT_VERSIONS) throw new AssistantError("Limite de 100 versões atingido. Contacte a administração.");
    const changed = await tx.assistantProfile.updateMany({ where: { organizationId: context.organizationId, version }, data: { version: { increment: 1 } } });
    if (changed.count !== 1) throw new AssistantError("A configuração mudou. Atualize a página.");
    await tx.assistantVersion.create({ data: { organizationId: context.organizationId, ...snapshot(input, version + 1) } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "assistant.updated", metadata: { version: version + 1, playbookVersion: PLAYBOOK_VERSION, mode: "SANDBOX" } } });
    return version + 1;
  });
}
export async function readAssistant(organizationId: string, selectedVersion?: number) {
  const context = await owner(organizationId);
  if (selectedVersion !== undefined) recordVersion.min(1).max(MAX_ASSISTANT_VERSIONS).parse(selectedVersion);
  return getDb().$transaction(async tx => {
    const profile = await tx.assistantProfile.findUnique({ where: { organizationId: context.organizationId } });
    if (!profile) return null;
    const selected = await tx.assistantVersion.findUnique({ where: { organizationId_version: { organizationId: context.organizationId, version: selectedVersion ?? profile.version } } });
    if (!selected) throw new AssistantError("Versão não encontrada.");
    const history = await tx.assistantVersion.findMany({ where: { organizationId: context.organizationId }, select: { version: true, createdAt: true, playbookVersion: true }, orderBy: { version: "desc" }, take: MAX_ASSISTANT_VERSIONS });
    return { version: profile.version, selected: { ...selected, configuration: assistantInput.parse(selected.configuration) }, history };
  }, { isolationLevel: "RepeatableRead" });
}
