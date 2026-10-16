-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SANDBOX',
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "passengers" INTEGER NOT NULL,
    "language" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "pricingType" "PricingType" NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "meetingPoint" TEXT NOT NULL,
    "pickupRules" TEXT NOT NULL,
    "pickup" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingOccupancy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "BookingOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "BookingStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_organizationId_createdAt_idx" ON "Customer"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_organizationId_key" ON "Customer"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Booking_organizationId_startsAt_id_idx" ON "Booking"("organizationId", "startsAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_id_organizationId_key" ON "Booking"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_organizationId_idempotencyKey_key" ON "Booking"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookingOccupancy_bookingId_key" ON "BookingOccupancy"("bookingId");

-- CreateIndex
CREATE INDEX "BookingOccupancy_organizationId_startsAt_endsAt_idx" ON "BookingOccupancy"("organizationId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingOccupancy_bookingId_organizationId_key" ON "BookingOccupancy"("bookingId", "organizationId");

-- CreateIndex
CREATE INDEX "BookingEvent_organizationId_bookingId_createdAt_idx" ON "BookingEvent"("organizationId", "bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_organizationId_fkey" FOREIGN KEY ("serviceId", "organizationId") REFERENCES "Service"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingOccupancy" ADD CONSTRAINT "BookingOccupancy_bookingId_organizationId_fkey" FOREIGN KEY ("bookingId", "organizationId") REFERENCES "Booking"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingOccupancy" ADD CONSTRAINT "BookingOccupancy_vehicleId_organizationId_fkey" FOREIGN KEY ("vehicleId", "organizationId") REFERENCES "Vehicle"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingOccupancy" ADD CONSTRAINT "BookingOccupancy_driverId_organizationId_fkey" FOREIGN KEY ("driverId", "organizationId") REFERENCES "Driver"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_organizationId_fkey" FOREIGN KEY ("bookingId", "organizationId") REFERENCES "Booking"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defend occupied intervals even for concurrent direct database writers.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "BookingOccupancy" ADD CONSTRAINT "BookingOccupancy_positive_interval" CHECK ("endsAt" > "startsAt");
ALTER TABLE "BookingOccupancy" ADD CONSTRAINT "BookingOccupancy_vehicle_exclusion" EXCLUDE USING gist ("organizationId" WITH =, "vehicleId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("releasedAt" IS NULL);
ALTER TABLE "BookingOccupancy" ADD CONSTRAINT "BookingOccupancy_driver_exclusion" EXCLUDE USING gist ("organizationId" WITH =, "driverId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("releasedAt" IS NULL);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_values" CHECK ("mode" = 'SANDBOX' AND "passengers" BETWEEN 1 AND 100 AND "endsAt" > "startsAt" AND "unitPriceCents" >= 0 AND "totalPriceCents" >= 0 AND "currency" = 'EUR');
