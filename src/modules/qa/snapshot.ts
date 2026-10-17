import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { QA_SUITE_VERSION } from "./domain";
export async function qaSnapshot(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: {
    id: true, timeZone: true, brand: { select: { version: true } },
    operator: { select: { status: true, approvedAt: true, approvedById: true, calendarVersion: true } },
    assistant: { select: { version: true } },
    services: { where: { active: true }, orderBy: { id: "asc" }, select: { id: true, version: true, name: true, basePriceCents: true, pricingType: true, capacity: true, languages: true, currency: true } },
    vehicles: { where: { active: true }, orderBy: { id: "asc" }, select: { id: true, version: true } },
    drivers: { where: { status: "ACTIVE" }, orderBy: { id: "asc" }, select: { id: true, version: true, user: { select: { active: true, memberships: { where: { organizationId }, select: { role: true, active: true } } } } } },
    serviceSchedules: { where: { active: true }, orderBy: { id: "asc" } },
    complianceRequirements: { where: { active: true }, orderBy: { id: "asc" }, select: { id: true, requiresExpiry: true, documents: { orderBy: { revision: "desc" }, take: 1, select: { id: true, revision: true, status: true, expiresOn: true, sha256: true } } } },
  } });
  const assistant = organization.assistant ? await tx.assistantVersion.findUniqueOrThrow({ where: { organizationId_version: { organizationId, version: organization.assistant.version } }, select: { configuration: true, playbookVersion: true, instructions: true } }) : null;
  const profile = organization.operator;
  const fingerprint = { organization, assistant, suite: QA_SUITE_VERSION, status: profile?.status };
  // Entering SANDBOX is the result of this run, not a change of tested configuration.
  if (profile && ["APPROVED", "SANDBOX", "CLIENT_REVIEW"].includes(profile.status)) fingerprint.status = "SANDBOX";
  const hash = createHash("sha256").update(JSON.stringify({ ...fingerprint, organization: { ...organization, operator: profile ? { ...profile, status: fingerprint.status } : null } })).digest("hex");
  return { organization, assistant, hash };
}
