-- CreateTable
CREATE TABLE "RetellConnection" (
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "checkedAt" TIMESTAMP(3),
    "checkResult" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    "checkToken" TEXT,
    "credentialHash" TEXT,
    "lastEventAt" TIMESTAMP(3),

    CONSTRAINT "RetellConnection_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "RetellEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callHash" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetellEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetellConnection_agentId_key" ON "RetellConnection"("agentId");

-- CreateIndex
CREATE INDEX "RetellEvent_organizationId_receivedAt_idx" ON "RetellEvent"("organizationId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetellEvent_organizationId_callHash_event_key" ON "RetellEvent"("organizationId", "callHash", "event");

-- AddForeignKey
ALTER TABLE "RetellConnection" ADD CONSTRAINT "RetellConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetellEvent" ADD CONSTRAINT "RetellEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RetellConnection"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetellConnection" ADD CONSTRAINT "retell_connection_check" CHECK (
  "version" BETWEEN 1 AND 9999 AND "agentId" ~ '^[A-Za-z0-9_-]{1,100}$' AND
  "checkResult" IN ('NOT_CHECKED','CHECKING','API_OK','WEBHOOK_MISMATCH','MISSING_CONFIG','UNAVAILABLE') AND
  (("checkResult" = 'API_OK' AND "checkedAt" IS NOT NULL AND "credentialHash" IS NOT NULL AND "credentialHash" ~ '^[0-9a-f]{64}$') OR
   ("checkResult" <> 'API_OK' AND "credentialHash" IS NULL))
  AND (("checkResult" = 'CHECKING' AND "checkToken" IS NOT NULL) OR ("checkResult" <> 'CHECKING' AND "checkToken" IS NULL))
);
ALTER TABLE "RetellEvent" ADD CONSTRAINT "retell_event_check" CHECK (
  "event" IN ('call_started','call_ended','call_analyzed') AND "callHash" ~ '^[0-9a-f]{64}$'
);
