-- CreateEnum
CREATE TYPE "DispatchOutcome" AS ENUM ('ASSIGNED', 'NO_CANDIDATE');

-- CreateEnum
CREATE TYPE "DispatchMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'ASSIGNED';

-- CreateTable
CREATE TABLE "DispatchDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "bookingVersion" INTEGER NOT NULL,
    "mode" "DispatchMode" NOT NULL,
    "outcome" "DispatchOutcome" NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "score" INTEGER,
    "factors" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatchDecision_organizationId_bookingId_createdAt_idx" ON "DispatchDecision"("organizationId", "bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchDecision_organizationId_idempotencyKey_key" ON "DispatchDecision"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "DispatchDecision" ADD CONSTRAINT "DispatchDecision_bookingId_organizationId_fkey" FOREIGN KEY ("bookingId", "organizationId") REFERENCES "Booking"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchDecision" ADD CONSTRAINT "DispatchDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchDecision" ADD CONSTRAINT "DispatchDecision_driverId_organizationId_fkey" FOREIGN KEY ("driverId", "organizationId") REFERENCES "Driver"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchDecision" ADD CONSTRAINT "DispatchDecision_vehicleId_organizationId_fkey" FOREIGN KEY ("vehicleId", "organizationId") REFERENCES "Vehicle"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DispatchDecision" ADD CONSTRAINT "DispatchDecision_result" CHECK (("outcome" = 'ASSIGNED' AND "driverId" IS NOT NULL AND "vehicleId" IS NOT NULL AND "score" IS NOT NULL AND "score" BETWEEN 0 AND 10000) OR ("outcome" = 'NO_CANDIDATE' AND "driverId" IS NULL AND "vehicleId" IS NULL AND "score" IS NULL));
ALTER TABLE "DispatchDecision" ADD CONSTRAINT "DispatchDecision_version" CHECK ("bookingVersion" > 0);
