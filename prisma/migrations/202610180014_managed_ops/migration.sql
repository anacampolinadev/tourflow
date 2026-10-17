-- AlterTable
ALTER TABLE "AssistantHandoff" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "HandoffEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "handoffId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandoffEvent_organizationId_handoffId_idx" ON "HandoffEvent"("organizationId", "handoffId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffEvent_handoffId_version_key" ON "HandoffEvent"("handoffId", "version");

-- CreateIndex
CREATE INDEX "AssistantHandoff_organizationId_status_createdAt_idx" ON "AssistantHandoff"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantHandoff_id_organizationId_key" ON "AssistantHandoff"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "AssistantHandoff" ADD CONSTRAINT "AssistantHandoff_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffEvent" ADD CONSTRAINT "HandoffEvent_handoffId_organizationId_fkey" FOREIGN KEY ("handoffId", "organizationId") REFERENCES "AssistantHandoff"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffEvent" ADD CONSTRAINT "HandoffEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssistantHandoff" ADD CONSTRAINT "handoff_state_check" CHECK (
  "version" BETWEEN 0 AND 100 AND (
    ("status" = 'OPEN' AND "assignedToId" IS NULL AND "resolvedAt" IS NULL) OR
    ("status" = 'IN_PROGRESS' AND "assignedToId" IS NOT NULL AND "resolvedAt" IS NULL) OR
    ("status" = 'RESOLVED' AND "assignedToId" IS NOT NULL AND "resolvedAt" IS NOT NULL)
  )
);
ALTER TABLE "HandoffEvent" ADD CONSTRAINT "handoff_event_check" CHECK (
  "version" BETWEEN 1 AND 100 AND octet_length("note") <= 4000 AND
  (("action" = 'RESOLVE' AND char_length(btrim("note")) BETWEEN 10 AND 1000) OR
   ("action" IN ('CLAIM', 'RELEASE', 'REOPEN') AND "note" = ''))
);
