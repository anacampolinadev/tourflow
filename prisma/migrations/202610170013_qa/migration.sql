-- CreateTable
CREATE TABLE "QaRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "suiteVersion" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaManualCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaManualCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QaRun_organizationId_createdAt_idx" ON "QaRun"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QaRun_id_organizationId_key" ON "QaRun"("id", "organizationId");

-- CreateIndex
CREATE INDEX "QaManualCheck_organizationId_runId_createdAt_idx" ON "QaManualCheck"("organizationId", "runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QaManualCheck_runId_scenario_revision_key" ON "QaManualCheck"("runId", "scenario", "revision");

-- AddForeignKey
ALTER TABLE "QaRun" ADD CONSTRAINT "QaRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaRun" ADD CONSTRAINT "QaRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaManualCheck" ADD CONSTRAINT "QaManualCheck_runId_organizationId_fkey" FOREIGN KEY ("runId", "organizationId") REFERENCES "QaRun"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaManualCheck" ADD CONSTRAINT "QaManualCheck_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QaRun" ADD CONSTRAINT "QaRun_report_check" CHECK ("snapshotHash" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("checks") = 'array' AND jsonb_array_length("checks") = 34 AND octet_length("checks"::text) <= 32768 AND "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '24 hours');
ALTER TABLE "QaManualCheck" ADD CONSTRAINT "QaManualCheck_revision_check" CHECK ("revision" BETWEEN 1 AND 10 AND "decision" IN ('FAIL', 'BLOCKED') AND "scenario" IN ('NORMAL_BOOKING', 'CONFUSED_CUSTOMER', 'NEGOTIATION', 'CHANGE_REQUEST', 'DIFFICULT_CASE') AND length("note") BETWEEN 20 AND 1000);
