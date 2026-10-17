import "server-only";
import { createHash } from "node:crypto";
import type { OperatorProfile, Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { currentTenant, requireCurrentSuperAdmin, requirePermission } from "@/modules/auth";
import { OperatorConflict } from "@/modules/tenants";
import { ComplianceError, MAX_DOCUMENTS, MAX_REQUIREMENTS, MAX_TENANT_BYTES, canApproveDocuments, canGenerateWorkspace, canSubmitDocuments, correctionInput, decisionInput, expiryDate, hasValidDocumentApproval, isDocumentValid, requirementInput, validateUpload, versionInput } from "./domain";

export type ComplianceScope = "owner" | "admin";
async function authorize(organizationId: string, scope: ComplianceScope) {
  if (scope === "admin") return requireCurrentSuperAdmin();
  if (scope !== "owner") throw new ComplianceError("Acesso inválido.");
  const context = await currentTenant(organizationId);
  requirePermission(context, "compliance:manage");
  return { id: context.actorId };
}

const documentMetadata = { id: true, fileName: true, mimeType: true, size: true, revision: true, status: true, expiresOn: true, createdAt: true, review: { select: { decision: true, note: true, createdAt: true } } } as const;
async function requirements(tx: Prisma.TransactionClient, organizationId: string) {
  const rows = await tx.complianceRequirement.findMany({ where: { organizationId, active: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { documents: { select: documentMetadata, orderBy: { revision: "desc" } } } });
  return rows.map(({ documents, ...requirement }) => ({ ...requirement, document: documents[0] ?? null, history: documents }));
}
function requireState(profile: OperatorProfile, ...states: OperatorProfile["status"][]) {
  if (!states.includes(profile.status)) throw new ComplianceError("Esta ação não está disponível no estado atual.");
}
async function mutate<T>(organizationId: string, expectedVersion: number, scope: ComplianceScope, action: string, work: (tx: Prisma.TransactionClient, profile: OperatorProfile, actorId: string) => Promise<T>) {
  const actor = await authorize(organizationId, scope);
  versionInput.parse(expectedVersion);
  return getDb().$transaction(async (tx) => {
    // Updating the root first locks it until commit. Every compliance writer uses this lock.
    const changed = await tx.operatorProfile.updateMany({ where: { organizationId, version: expectedVersion }, data: { version: { increment: 1 } } });
    if (changed.count !== 1) throw new OperatorConflict();
    const profile = await tx.operatorProfile.findUniqueOrThrow({ where: { organizationId } });
    const result = await work(tx, profile, actor.id);
    await tx.auditLog.create({ data: { organizationId, actorId: actor.id, action, metadata: { version: profile.version } } });
    return result;
  });
}

export async function readCompliance(organizationId: string, scope: ComplianceScope) {
  const actor = await authorize(organizationId, scope);
  return getDb().$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, operator: true } });
    if (!organization?.operator) return null;
    const rows = await requirements(tx, organizationId);
    if (scope === "admin") await tx.auditLog.create({ data: { organizationId, actorId: actor.id, action: "admin.compliance.read", metadata: {} } });
    return { organization, profile: organization.operator, requirements: rows, canSubmit: canSubmitDocuments(organization.operator.status, rows), canApprove: canApproveDocuments(organization.operator.status, rows), canGenerate: canGenerateWorkspace(organization.operator, rows) };
  });
}

export async function addRequirement(organizationId: string, version: number, raw: unknown) {
  const input = requirementInput.parse(raw);
  return mutate(organizationId, version, "admin", "compliance.requirement.added", async (tx, profile) => {
    requireState(profile, "ONBOARDING", "DOCS_PENDING");
    if (await tx.complianceRequirement.count({ where: { organizationId } }) >= MAX_REQUIREMENTS) throw new ComplianceError("Limite de 12 requisitos atingido, incluindo os desativados.");
    const requirement = await tx.complianceRequirement.create({ data: { organizationId, ...input } });
    await tx.operatorProfile.update({ where: { organizationId }, data: { status: "DOCS_PENDING" } });
    return requirement;
  });
}

export async function deactivateRequirement(organizationId: string, version: number, requirementId: string) {
  return mutate(organizationId, version, "admin", "compliance.requirement.deactivated", async (tx, profile) => {
    requireState(profile, "DOCS_PENDING");
    const changed = await tx.complianceRequirement.updateMany({ where: { id: requirementId, organizationId, active: true }, data: { active: false } });
    if (changed.count !== 1) throw new ComplianceError("Requisito não encontrado.");
  });
}

export async function uploadDocument(organizationId: string, version: number, input: { requirementId: string; fileName: string; mimeType: string; bytes: Uint8Array; expiresOn: unknown }) {
  await authorize(organizationId, "owner");
  validateUpload(input.fileName, input.mimeType, input.bytes);
  const expiresOn = expiryDate(input.expiresOn);
  return mutate(organizationId, version, "owner", "compliance.document.uploaded", async (tx, profile, actorId) => {
    requireState(profile, "DOCS_PENDING");
    const requirement = await tx.complianceRequirement.findFirst({ where: { id: input.requirementId, organizationId, active: true } });
    if (!requirement || !isDocumentValid({ ...requirement, document: { id: "new", status: "PENDING", expiresOn } })) throw new ComplianceError("Requisito ou validade inválidos.");
    const totals = await tx.complianceDocument.aggregate({ where: { organizationId }, _count: true, _sum: { size: true } });
    if (totals._count >= MAX_DOCUMENTS || (totals._sum.size ?? 0) + input.bytes.length > MAX_TENANT_BYTES) throw new ComplianceError("Limite de arquivo atingido: 50 versões ou 25 MB por operador.");
    const last = await tx.complianceDocument.findFirst({ where: { organizationId, requirementId: requirement.id }, orderBy: { revision: "desc" }, select: { revision: true } });
    return tx.complianceDocument.create({ data: { organizationId, requirementId: requirement.id, revision: (last?.revision ?? 0) + 1, fileName: input.fileName, mimeType: input.mimeType, size: input.bytes.length, data: new Uint8Array(input.bytes), sha256: createHash("sha256").update(input.bytes).digest("hex"), expiresOn, uploadedById: actorId }, select: { id: true } });
  });
}

export async function submitDocuments(organizationId: string, version: number) {
  return mutate(organizationId, version, "owner", "compliance.submitted", async (tx, profile) => {
    const rows = await requirements(tx, organizationId);
    if (!canSubmitDocuments(profile.status, rows)) throw new ComplianceError("Complete os documentos e substitua os rejeitados ou expirados antes de enviar.");
    const ids = rows.flatMap((row) => row.document?.status === "PENDING" ? [row.document.id] : []);
    await tx.complianceDocument.updateMany({ where: { organizationId, id: { in: ids } }, data: { status: "UNDER_REVIEW" } });
    await tx.operatorProfile.update({ where: { organizationId }, data: { status: "UNDER_REVIEW", complianceNote: null, approvedAt: null, approvedById: null } });
  });
}

export async function reviewDocument(organizationId: string, version: number, documentId: string, rawDecision: unknown, rawNote: unknown) {
  const decision = decisionInput.parse(rawDecision);
  const note = decision === "REJECTED" ? correctionInput.parse(rawNote) : null;
  return mutate(organizationId, version, "admin", "compliance.document.reviewed", async (tx, profile, actorId) => {
    requireState(profile, "UNDER_REVIEW");
    const row = (await requirements(tx, organizationId)).find((row) => row.document?.id === documentId);
    if (!row?.document || row.document.status !== "UNDER_REVIEW") throw new ComplianceError("Documento indisponível para análise.");
    if (decision === "APPROVED" && !isDocumentValid(row)) throw new ComplianceError("O documento expirou. Solicite uma correção.");
    await tx.complianceReview.create({ data: { organizationId, documentId, reviewerId: actorId, decision, note } });
    await tx.complianceDocument.update({ where: { id_organizationId: { id: documentId, organizationId } }, data: { status: decision } });
    if (decision === "REJECTED") await tx.operatorProfile.update({ where: { organizationId }, data: { status: "DOCS_PENDING", complianceNote: note, approvedAt: null, approvedById: null } });
  });
}

export async function requestCorrections(organizationId: string, version: number, rawNote: unknown) {
  const note = correctionInput.parse(rawNote);
  return mutate(organizationId, version, "admin", "compliance.corrections.requested", async (tx, profile) => {
    requireState(profile, "UNDER_REVIEW", "APPROVED", "SANDBOX", "CLIENT_REVIEW");
    await tx.operatorProfile.update({ where: { organizationId }, data: { status: "DOCS_PENDING", complianceNote: note, approvedAt: null, approvedById: null } });
  });
}

export async function approveOperator(organizationId: string, version: number) {
  return mutate(organizationId, version, "admin", "compliance.approved", async (tx, profile, actorId) => {
    if (!canApproveDocuments(profile.status, await requirements(tx, organizationId))) throw new ComplianceError("Aprove todos os documentos válidos antes da aprovação final.");
    await tx.operatorProfile.update({ where: { organizationId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actorId, complianceNote: null } });
  });
}

export async function downloadDocument(organizationId: string, documentId: string, scope: ComplianceScope) {
  const actor = await authorize(organizationId, scope);
  return getDb().$transaction(async (tx) => {
    const document = await tx.complianceDocument.findFirst({ where: { id: documentId, organizationId }, select: { data: true, mimeType: true } });
    if (document) await tx.auditLog.create({ data: { organizationId, actorId: actor.id, action: "compliance.document.downloaded", metadata: { admin: scope === "admin", documentId } } });
    return document;
  });
}

// Trusted server composition: caller must authorize and lock OperatorProfile first.
export async function assertSandboxBookingApproval(tx: Prisma.TransactionClient, organizationId: string, now = new Date()) {
  const profile = await tx.operatorProfile.findUnique({ where: { organizationId } });
  if (!profile || !["APPROVED", "SANDBOX", "CLIENT_REVIEW"].includes(profile.status) ||
      !hasValidDocumentApproval(profile, await requirements(tx, organizationId), now)) {
    throw new ComplianceError("Reservas de teste exigem aprovação documental válida. A operação pública ainda não está disponível.");
  }
}
