-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assistantVersion" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantToolCall" (
    "conversationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantToolCall_pkey" PRIMARY KEY ("conversationId","callId")
);

-- CreateTable
CREATE TABLE "AssistantHandoff" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_organizationId_actorId_createdAt_idx" ON "AssistantConversation"("organizationId", "actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantConversation_id_organizationId_key" ON "AssistantConversation"("id", "organizationId");

-- CreateIndex
CREATE INDEX "AssistantToolCall_organizationId_bookingId_idx" ON "AssistantToolCall"("organizationId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantHandoff_conversationId_key" ON "AssistantHandoff"("conversationId");

-- CreateIndex
CREATE INDEX "AssistantHandoff_organizationId_createdAt_idx" ON "AssistantHandoff"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantHandoff_conversationId_organizationId_key" ON "AssistantHandoff"("conversationId", "organizationId");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_organizationId_assistantVersion_fkey" FOREIGN KEY ("organizationId", "assistantVersion") REFERENCES "AssistantVersion"("organizationId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantToolCall" ADD CONSTRAINT "AssistantToolCall_conversationId_organizationId_fkey" FOREIGN KEY ("conversationId", "organizationId") REFERENCES "AssistantConversation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantToolCall" ADD CONSTRAINT "AssistantToolCall_bookingId_organizationId_fkey" FOREIGN KEY ("bookingId", "organizationId") REFERENCES "Booking"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantHandoff" ADD CONSTRAINT "AssistantHandoff_conversationId_organizationId_fkey" FOREIGN KEY ("conversationId", "organizationId") REFERENCES "AssistantConversation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_expiry_check" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '24 hours');
ALTER TABLE "AssistantToolCall" ADD CONSTRAINT "AssistantToolCall_kind_check" CHECK (("tool" = 'create_booking' AND "bookingId" IS NOT NULL OR "tool" = 'handoff_to_human' AND "bookingId" IS NULL) AND "requestHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "AssistantHandoff" ADD CONSTRAINT "AssistantHandoff_reason_check" CHECK (length("reason") BETWEEN 3 AND 500);
