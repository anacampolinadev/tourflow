import { z } from "zod";
import type { OperatorStatus } from "../tenants";

export class ComplianceError extends Error {
  constructor(message: string) { super(message); this.name = "ComplianceError"; }
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TENANT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENTS = 50;
export const MAX_REQUIREMENTS = 12;
export const versionInput = z.number().int().min(0);
export const requirementInput = z.object({ title: z.string().trim().min(3).max(120), requiresExpiry: z.boolean() }).strict();
export const correctionInput = z.string().trim().min(5).max(1000);
export const decisionInput = z.enum(["APPROVED", "REJECTED"]);

export type DocumentSnapshot = { id: string; status: string; expiresOn: Date | null };
export type RequirementSnapshot = { id: string; requiresExpiry: boolean; document: DocumentSnapshot | null };

// A date-only expiry remains valid through the selected UTC calendar date.
export function isDocumentValid(requirement: RequirementSnapshot, now = new Date()): boolean {
  const document = requirement.document;
  if (!document || (requirement.requiresExpiry && !document.expiresOn)) return false;
  return !document.expiresOn || document.expiresOn.toISOString().slice(0, 10) >= now.toISOString().slice(0, 10);
}

export function canSubmitDocuments(status: OperatorStatus, requirements: RequirementSnapshot[], now = new Date()): boolean {
  return status === "DOCS_PENDING" && requirements.length > 0 && requirements.every((requirement) => isDocumentValid(requirement, now) && requirement.document?.status !== "REJECTED");
}

export function canApproveDocuments(status: OperatorStatus, requirements: RequirementSnapshot[], now = new Date()): boolean {
  return status === "UNDER_REVIEW" && requirements.length > 0 && requirements.every((requirement) => isDocumentValid(requirement, now) && requirement.document?.status === "APPROVED");
}

export function canGenerateWorkspace(profile: { status: OperatorStatus; approvedAt: Date | null; approvedById: string | null }, requirements: RequirementSnapshot[], now = new Date()): boolean {
  return profile.status === "APPROVED" && Boolean(profile.approvedAt && profile.approvedById) && canApproveDocuments("UNDER_REVIEW", requirements, now);
}

export function expiryDate(raw: unknown): Date | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  const value = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(raw);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new ComplianceError("Data de validade inválida.");
  return parsed;
}

export function validateUpload(fileName: string, mimeType: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new ComplianceError("O ficheiro deve ter no máximo 2 MB.");
  if (!fileName || fileName.length > 120 || /[\\/\x00-\x1f:]/.test(fileName)) throw new ComplianceError("Nome de ficheiro inválido.");
  const name = fileName.toLowerCase();
  const pdf = name.endsWith(".pdf") && mimeType === "application/pdf" && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  const png = name.endsWith(".png") && mimeType === "image/png" && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = /\.jpe?g$/.test(name) && mimeType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!pdf && !png && !jpeg) throw new ComplianceError("Envie um PDF, PNG ou JPEG com formato válido.");
}

export const documentLabels: Record<string, string> = { PENDING: "A enviar para análise", UNDER_REVIEW: "Em análise", APPROVED: "Aprovado", REJECTED: "Correção necessária", EXPIRED: "Expirado", EXPIRING: "A expirar" };
