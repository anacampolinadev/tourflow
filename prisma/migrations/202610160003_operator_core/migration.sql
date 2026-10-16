-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('PER_PERSON', 'PER_GROUP');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('JEEP', 'CAR', 'VAN', 'MINIBUS', 'BUS');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('INVITED', 'PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "pricingType" "PricingType" NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "capacity" INTEGER NOT NULL,
    "meetingPoint" TEXT NOT NULL,
    "pickupAvailable" BOOLEAN NOT NULL DEFAULT false,
    "pickupRules" TEXT NOT NULL DEFAULT '',
    "languages" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "registration" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "features" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "languages" TEXT[],
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_organizationId_active_name_idx" ON "Service"("organizationId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_organizationId_key" ON "Service"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_active_name_idx" ON "Vehicle"("organizationId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_organizationId_registration_key" ON "Vehicle"("organizationId", "registration");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_id_organizationId_key" ON "Vehicle"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Driver_organizationId_status_name_idx" ON "Driver"("organizationId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_organizationId_email_key" ON "Driver"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_id_organizationId_key" ON "Driver"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
