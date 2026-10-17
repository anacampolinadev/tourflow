-- CreateEnum
CREATE TYPE "DriverActionType" AS ENUM ('ACCEPT', 'DECLINE', 'ARRIVE', 'START', 'COMPLETE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'DRIVER_ACCEPTED';
ALTER TYPE "BookingStatus" ADD VALUE 'DRIVER_DECLINED';
ALTER TYPE "BookingStatus" ADD VALUE 'ARRIVED';
ALTER TYPE "BookingStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "BookingStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "DriverAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "bookingVersion" INTEGER NOT NULL,
    "type" "DriverActionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverAction_organizationId_bookingId_type_idx" ON "DriverAction"("organizationId", "bookingId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DriverAction_organizationId_idempotencyKey_key" ON "DriverAction"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_organizationId_userId_key" ON "Driver"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAction" ADD CONSTRAINT "DriverAction_bookingId_organizationId_fkey" FOREIGN KEY ("bookingId", "organizationId") REFERENCES "Booking"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAction" ADD CONSTRAINT "DriverAction_driverId_organizationId_fkey" FOREIGN KEY ("driverId", "organizationId") REFERENCES "Driver"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAction" ADD CONSTRAINT "DriverAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverAction" ADD CONSTRAINT "DriverAction_version_positive" CHECK ("bookingVersion" > 0);
