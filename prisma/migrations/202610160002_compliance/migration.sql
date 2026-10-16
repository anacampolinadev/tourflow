-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "OperatorProfile" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "complianceNote" TEXT;

-- CreateTable
CREATE TABLE "ComplianceRequirement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "expiresOn" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceRequirement_organizationId_active_idx" ON "ComplianceRequirement"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRequirement_id_organizationId_key" ON "ComplianceRequirement"("id", "organizationId");

-- CreateIndex
CREATE INDEX "ComplianceDocument_organizationId_idx" ON "ComplianceDocument"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_requirementId_revision_key" ON "ComplianceDocument"("requirementId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_id_organizationId_key" ON "ComplianceDocument"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceReview_documentId_key" ON "ComplianceReview"("documentId");

-- CreateIndex
CREATE INDEX "ComplianceReview_organizationId_createdAt_idx" ON "ComplianceReview"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceReview_documentId_organizationId_key" ON "ComplianceReview"("documentId", "organizationId");

-- AddForeignKey
ALTER TABLE "OperatorProfile" ADD CONSTRAINT "OperatorProfile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_requirementId_organizationId_fkey" FOREIGN KEY ("requirementId", "organizationId") REFERENCES "ComplianceRequirement"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceReview" ADD CONSTRAINT "ComplianceReview_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "ComplianceDocument"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceReview" ADD CONSTRAINT "ComplianceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
