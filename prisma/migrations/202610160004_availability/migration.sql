-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'Europe/Lisbon';

-- AlterTable
ALTER TABLE "OperatorProfile" ADD COLUMN     "calendarVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ServiceSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "departureMinutes" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVehicle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverAvailability" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceBlock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceSchedule_organizationId_serviceId_active_idx" ON "ServiceSchedule"("organizationId", "serviceId", "active");

-- CreateIndex
CREATE INDEX "ServiceVehicle_organizationId_serviceId_active_idx" ON "ServiceVehicle"("organizationId", "serviceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceVehicle_organizationId_serviceId_vehicleId_key" ON "ServiceVehicle"("organizationId", "serviceId", "vehicleId");

-- CreateIndex
CREATE INDEX "DriverAvailability_organizationId_startsAt_endsAt_idx" ON "DriverAvailability"("organizationId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DriverAvailability_organizationId_driverId_active_idx" ON "DriverAvailability"("organizationId", "driverId", "active");

-- CreateIndex
CREATE INDEX "ResourceBlock_organizationId_startsAt_endsAt_idx" ON "ResourceBlock"("organizationId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "ServiceSchedule" ADD CONSTRAINT "ServiceSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSchedule" ADD CONSTRAINT "ServiceSchedule_serviceId_organizationId_fkey" FOREIGN KEY ("serviceId", "organizationId") REFERENCES "Service"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVehicle" ADD CONSTRAINT "ServiceVehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVehicle" ADD CONSTRAINT "ServiceVehicle_serviceId_organizationId_fkey" FOREIGN KEY ("serviceId", "organizationId") REFERENCES "Service"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVehicle" ADD CONSTRAINT "ServiceVehicle_vehicleId_organizationId_fkey" FOREIGN KEY ("vehicleId", "organizationId") REFERENCES "Vehicle"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAvailability" ADD CONSTRAINT "DriverAvailability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAvailability" ADD CONSTRAINT "DriverAvailability_driverId_organizationId_fkey" FOREIGN KEY ("driverId", "organizationId") REFERENCES "Driver"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceBlock" ADD CONSTRAINT "ResourceBlock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceBlock" ADD CONSTRAINT "ResourceBlock_vehicleId_organizationId_fkey" FOREIGN KEY ("vehicleId", "organizationId") REFERENCES "Vehicle"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceBlock" ADD CONSTRAINT "ResourceBlock_driverId_organizationId_fkey" FOREIGN KEY ("driverId", "organizationId") REFERENCES "Driver"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defensive constraints supplement tenant-composite FKs and transactional validation.
ALTER TABLE "ServiceSchedule" ADD CONSTRAINT "ServiceSchedule_bounds_check" CHECK ("weekday" BETWEEN 1 AND 7 AND "departureMinutes" BETWEEN 0 AND 1439 AND "validUntil" >= "validFrom" AND "bufferBeforeMinutes" BETWEEN 0 AND 240 AND "bufferAfterMinutes" BETWEEN 0 AND 240);
ALTER TABLE "DriverAvailability" ADD CONSTRAINT "DriverAvailability_interval_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "ResourceBlock" ADD CONSTRAINT "ResourceBlock_interval_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "ResourceBlock" ADD CONSTRAINT "ResourceBlock_target_check" CHECK (("driverId" IS NULL) <> ("vehicleId" IS NULL));
