import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AccessDenied, currentTenant, requireCurrentSuperAdmin } from "@/modules/auth";
import { assertSandboxBookingApproval } from "@/modules/compliance";
import { QA_SUITE_VERSION, QaError, manualInput, qaChecks, summarizeQa, type QaCheck } from "./domain";
import { qaSnapshot } from "./snapshot";
import { runSuite } from "./suite";

async function owner(organizationId: string) {
  const context = await currentTenant(organizationId); if (context.role !== "OPERATOR_OWNER") throw new AccessDenied(); return context;
}
async function lockOwner(tx: Prisma.TransactionClient, context: Awaited<ReturnType<typeof owner>>) {
  await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
  const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actorId } }, include: { user: { select: { active: true } } } });
  if (!member?.active || member.role !== "OPERATOR_OWNER" || !member.user.active) throw new AccessDenied();
}
class RollbackReport extends Error {
  constructor(readonly hash: string, readonly checks: QaCheck[]) { super("Rollback-only QA complete"); }
}
async function quota(tx: Prisma.TransactionClient, organizationId: string) {
  if (await tx.qaRun.count({ where: { organizationId } }) >= 100) throw new QaError("Limite de 100 relatórios atingido. Contacte a administração.");
}
export async function runOperatorQa(organizationId: string) {
  const context = await owner(organizationId);
  let report: RollbackReport;
  try {
    await getDb().$transaction(async tx => {
      await lockOwner(tx, context); await assertSandboxBookingApproval(tx, context.organizationId); await quota(tx, context.organizationId);
      const snapshot = await qaSnapshot(tx, context.organizationId);
      if (!["APPROVED", "SANDBOX"].includes(snapshot.organization.operator?.status ?? "")) throw new QaError("O operador deve estar aprovado ou em testes.");
      throw new RollbackReport(snapshot.hash, qaChecks.parse(await runSuite(tx, context, snapshot)));
    }, { isolationLevel: "ReadCommitted", timeout: 30000 });
    throw new QaError("A bateria não confirmou o rollback. Nenhum relatório foi aprovado.");
  } catch (error) {
    if (!(error instanceof RollbackReport)) throw error;
    report = error;
  }
  return getDb().$transaction(async tx => {
    await lockOwner(tx, context); await assertSandboxBookingApproval(tx, context.organizationId); await quota(tx, context.organizationId);
    const current = await qaSnapshot(tx, context.organizationId);
    if (current.hash !== report.hash) throw new QaError("A configuração mudou durante os testes. Execute novamente.");
    const now = new Date();
    const run = await tx.qaRun.create({ data: { organizationId: context.organizationId, actorId: context.actorId, suiteVersion: QA_SUITE_VERSION, snapshotHash: report.hash, checks: report.checks, createdAt: now, expiresAt: new Date(now.valueOf() + 24 * 3600000) } });
    if (current.organization.operator?.status === "APPROVED") await tx.operatorProfile.update({ where: { organizationId: context.organizationId }, data: { status: "SANDBOX", version: { increment: 1 } } });
    const summary = summarizeQa(report.checks);
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "qa.run_completed", metadata: { runId: run.id, suiteVersion: QA_SUITE_VERSION, passed: summary.passed, failed: summary.failed, blocked: summary.blocked, productionReady: false, mode: "SANDBOX" } } });
    return run.id;
  });
}
export async function readOperatorQa(organizationId: string, scope: "owner" | "admin", runId?: string) {
  if (scope !== "owner" && scope !== "admin") throw new AccessDenied();
  const actorId = scope === "owner" ? (await owner(organizationId)).actorId : (await requireCurrentSuperAdmin()).id;
  if (runId && (runId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(runId))) throw new QaError("Relatório não encontrado.");
  return getDb().$transaction(async tx => {
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }); if (!organization) return null;
    const snapshot = await qaSnapshot(tx, organizationId);
    let documentsValid = true; try { await assertSandboxBookingApproval(tx, organizationId); } catch { documentsValid = false; }
    const history = await tx.qaRun.findMany({ where: { organizationId }, select: { id: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 });
    const selected = runId ?? history[0]?.id;
    const row = selected ? await tx.qaRun.findFirst({ where: { organizationId, id: selected }, include: { reviews: { orderBy: [{ revision: "desc" }, { createdAt: "desc" }], take: 50 } } }) : null;
    if (runId && !row) throw new QaError("Relatório não encontrado.");
    const run = row ? { ...row, ...summarizeQa(row.checks), stale: row.snapshotHash !== snapshot.hash || row.suiteVersion !== QA_SUITE_VERSION || row.expiresAt <= new Date() || !documentsValid } : null;
    if (run?.stale) run.internalReady = false;
    if (scope === "admin") await tx.auditLog.create({ data: { organizationId, actorId, action: "admin.qa.read", metadata: { runId: row?.id ?? null } } });
    return { organization, history, run, canRun: documentsValid && ["APPROVED", "SANDBOX"].includes(snapshot.organization.operator?.status ?? ""), productionReady: false as const };
  }, { isolationLevel: "RepeatableRead" });
}
export async function recordManualQa(organizationId: string, runId: string, raw: unknown) {
  const actor = await requireCurrentSuperAdmin(), input = manualInput.parse(raw);
  if (input.decision === "PASS") throw new QaError("Conversas reais ainda não estão integradas. Não é possível declarar aprovação de conversação.");
  return getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { active: true, platformRole: true } });
    if (!user?.active || user.platformRole !== "SUPER_ADMIN") throw new AccessDenied();
    const run = await tx.qaRun.findFirst({ where: { id: runId, organizationId } });
    if (!run) throw new QaError("Relatório não encontrado.");
    const current = await qaSnapshot(tx, organizationId);
    if (run.snapshotHash !== current.hash || run.suiteVersion !== QA_SUITE_VERSION || run.expiresAt <= new Date()) throw new QaError("Relatório desatualizado. Peça ao responsável uma nova bateria.");
    await assertSandboxBookingApproval(tx, organizationId);
    const last = await tx.qaManualCheck.findFirst({ where: { runId, organizationId, scenario: input.scenario }, orderBy: { revision: "desc" }, select: { revision: true } });
    if ((last?.revision ?? 0) !== input.expectedRevision) throw new QaError("A revisão mudou. Atualize a página.");
    const review = await tx.qaManualCheck.create({ data: { organizationId, runId, scenario: input.scenario, revision: input.expectedRevision + 1, decision: input.decision, note: input.note, reviewerId: actor.id } });
    await tx.auditLog.create({ data: { organizationId, actorId: actor.id, action: "qa.manual_recorded", metadata: { runId, scenario: input.scenario, revision: review.revision, decision: input.decision, productionReady: false } } });
  });
}
