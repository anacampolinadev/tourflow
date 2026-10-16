import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { availabilityInTransaction, availabilityReasons } from "@/modules/availability";
import { assertSandboxBookingApproval } from "@/modules/compliance";
import { recordVersion } from "@/modules/tenants";
import { BookingError, assertCancellable, bookingInput, bookingPrice } from "./domain";

export async function createBooking(organizationId: string, raw: unknown) {
  const context = await currentTenant(organizationId); requirePermission(context, "operations:manage");
  const input = bookingInput.parse(raw);
  const { idempotencyKey, ...payload } = input;
  const requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return getDb().$transaction(async (tx) => {
    // ReadCommitted + shared tenant root: a waiter sees the preceding commit.
    await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
    const previous = await tx.booking.findUnique({ where: { organizationId_idempotencyKey: { organizationId: context.organizationId, idempotencyKey } } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new BookingError("Esta chave já foi utilizada com dados diferentes. Inicie uma nova reserva.");
      return previous;
    }
    const now = new Date();
    await assertSandboxBookingApproval(tx, context.organizationId, now);
    const availability = await availabilityInTransaction(tx, context.organizationId, { serviceId: input.serviceId, date: input.date, time: input.time, passengers: input.passengers, ...(input.language ? { language: input.language } : {}) }, now);
    if (!availability.available) throw new BookingError(availabilityReasons[availability.reason]);
    await assertSandboxBookingApproval(tx, context.organizationId, new Date(availability.endsAt));
    const vehicle = availability.eligibleVehicles[0], driver = availability.eligibleDrivers[0];
    if (!vehicle || !driver) throw new BookingError("Os recursos já não estão disponíveis.");
    const service = await tx.service.findFirstOrThrow({ where: { id: input.serviceId, organizationId: context.organizationId } });
    if (input.pickup && !service.pickupAvailable) throw new BookingError("Este serviço não permite recolha.");
    const totalPriceCents = bookingPrice(service.pricingType, service.basePriceCents, input.passengers);
    const customer = await tx.customer.create({ data: { organizationId: context.organizationId, name: input.customerName, email: input.customerEmail, phone: input.customerPhone } });
    const booking = await tx.booking.create({ data: {
      organizationId: context.organizationId, serviceId: service.id, customerId: customer.id, idempotencyKey, requestHash,
      passengers: input.passengers, language: input.language, startsAt: new Date(availability.startsAt), endsAt: new Date(availability.endsAt), timeZone: availability.timeZone,
      serviceName: service.name, pricingType: service.pricingType, unitPriceCents: service.basePriceCents, totalPriceCents, currency: service.currency,
      meetingPoint: service.meetingPoint, pickupRules: service.pickupRules, pickup: input.pickup, notes: input.notes, source: input.source,
    } });
    // Capacity hold only. Fair Dispatch/driver assignment is a separate sprint.
    await tx.bookingOccupancy.create({ data: { organizationId: context.organizationId, bookingId: booking.id, vehicleId: vehicle.id, driverId: driver.id, startsAt: new Date(availability.occupiedStartsAt), endsAt: new Date(availability.occupiedEndsAt) } });
    await tx.bookingEvent.create({ data: { organizationId: context.organizationId, bookingId: booking.id, type: "CONFIRMED" } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "booking.confirmed", metadata: { bookingId: booking.id, mode: "SANDBOX" } } });
    return booking;
  }, { isolationLevel: "ReadCommitted" });
}

export async function cancelBooking(organizationId: string, bookingId: string, version: number) {
  const context = await currentTenant(organizationId); requirePermission(context, "operations:manage"); recordVersion.parse(version);
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
    const booking = await tx.booking.findFirst({ where: { id: bookingId, organizationId: context.organizationId } });
    if (!booking) throw new BookingError("Reserva não encontrada neste operador.");
    assertCancellable(booking.status);
    if (booking.status === "CANCELLED") return booking;
    if (booking.version !== version) throw new BookingError("A reserva mudou. Atualize a página.");
    const now = new Date();
    const cancelled = await tx.booking.update({ where: { id: booking.id, organizationId: context.organizationId }, data: { status: "CANCELLED", version: { increment: 1 }, cancelledAt: now } });
    await tx.bookingOccupancy.updateMany({ where: { bookingId, organizationId: context.organizationId, releasedAt: null }, data: { releasedAt: now } });
    await tx.bookingEvent.create({ data: { organizationId: context.organizationId, bookingId, type: "CANCELLED" } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "booking.cancelled", metadata: { bookingId } } });
    return cancelled;
  }, { isolationLevel: "ReadCommitted" });
}

export async function readBookings(organizationId: string, page = 1) {
  const context = await currentTenant(organizationId); requirePermission(context, "organization:read");
  const index = recordVersion.min(1).max(10000).parse(page);
  const [organization, bookings] = await Promise.all([
    getDb().organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { id: true, name: true, timeZone: true, services: { where: { active: true }, select: { id: true, name: true, basePriceCents: true, currency: true, pricingType: true }, orderBy: { name: "asc" } } } }),
    getDb().booking.findMany({ where: { organizationId: context.organizationId }, include: { customer: true, events: { orderBy: { createdAt: "asc" } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21, skip: (index - 1) * 20 }),
  ]);
  return { organization, context, bookings: bookings.slice(0, 20), hasNext: bookings.length > 20, page: index };
}
