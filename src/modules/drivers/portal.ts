import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AccessDenied, currentTenant, requirePermission } from "@/modules/auth";
import { lockOperatorCatalog, recordVersion } from "@/modules/tenants";
import { assertSandboxBookingApproval } from "@/modules/compliance";
import { driverCommand, driverTransition, DriverPortalError } from "./portal-domain";

// Explicit owner action, separate from recording/editing a driver's contact details.
export async function enableDriverAccount(organizationId: string, driverId: string, version: number) {
  const context = await currentTenant(organizationId); requirePermission(context, "members:manage"); recordVersion.parse(version);
  return getDb().$transaction(async (tx) => {
    await lockOperatorCatalog(tx, context.organizationId);
    const driver = await tx.driver.findFirst({ where: { organizationId: context.organizationId, id: driverId } });
    if (!driver || driver.version !== version) throw new DriverPortalError("O cadastro mudou. Atualize a página.");
    if (driver.userId) throw new DriverPortalError("Este motorista já tem uma conta associada.");
    const user = await tx.user.upsert({ where: { email: driver.email }, create: { email: driver.email, name: driver.name }, update: {} });
    if (!user.active || user.platformRole !== "USER") throw new DriverPortalError("Esta conta não pode ser associada a um motorista.");
    const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: user.id } } });
    if (member && (member.role !== "DRIVER" || !member.active)) throw new DriverPortalError("Esta conta já tem outro vínculo ou está desativada. Não foi alterada.");
    if (!member) await tx.organizationMember.create({ data: { organizationId: context.organizationId, userId: user.id, role: "DRIVER" } });
    await tx.driver.update({ where: { id: driverId, organizationId: context.organizationId, version }, data: { userId: user.id, version: { increment: 1 } } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "driver.account.enabled", metadata: { driverId, userId: user.id } } });
  });
}

async function ownDriver(tx: Prisma.TransactionClient, organizationId: string, actorId: string) {
  const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorId } }, include: { user: { select: { active: true } } } });
  if (!member?.active || member.role !== "DRIVER" || !member.user.active) throw new AccessDenied();
  const driver = await tx.driver.findFirst({ where: { organizationId, userId: actorId, status: "ACTIVE" }, select: { id: true, name: true } });
  if (!driver) throw new AccessDenied();
  return driver;
}
export async function readDriverPortal(organizationId: string, rawPage: unknown = 1, history = false) {
  const context = await currentTenant(organizationId); requirePermission(context, "assignments:own");
  const page = recordVersion.min(1).max(10000).parse(rawPage);
  return getDb().$transaction(async (tx) => {
    const driver = await ownDriver(tx, context.organizationId, context.actorId);
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { name: true, timeZone: true, operator: { select: { status: true } } } });
    // Never expose provisional holds, other drivers, prices, customer email or private operator notes.
    const bookings = await tx.booking.findMany({ where: { organizationId: context.organizationId, mode: "SANDBOX", status: { in: history ? ["COMPLETED"] : ["ASSIGNED", "DRIVER_ACCEPTED", "ARRIVED", "IN_PROGRESS"] }, occupancy: { organizationId: context.organizationId, driverId: driver.id, releasedAt: null } }, select: { id: true, version: true, status: true, serviceName: true, startsAt: true, endsAt: true, timeZone: true, passengers: true, language: true, meetingPoint: true, pickup: true, pickupRules: true, customer: { select: { name: true, phone: true } }, occupancy: { select: { vehicle: { select: { name: true, registration: true } } } } }, orderBy: [{ startsAt: history ? "desc" : "asc" }, { id: "asc" }], take: 21, skip: (page - 1) * 20 });
    return { driver, organization, bookings: bookings.slice(0, 20), page, hasNext: bookings.length > 20 };
  }, { isolationLevel: "RepeatableRead" });
}
export async function actOnDriverBooking(organizationId: string, bookingId: string, raw: unknown) {
  const context = await currentTenant(organizationId); requirePermission(context, "assignments:own");
  const input = driverCommand.parse(raw), { idempotencyKey, ...payload } = input;
  const requestHash = createHash("sha256").update(JSON.stringify({ bookingId, actorId: context.actorId, ...payload })).digest("hex");
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
    const driver = await ownDriver(tx, context.organizationId, context.actorId);
    const previous = await tx.driverAction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: context.organizationId, idempotencyKey } } });
    if (previous) {
      if (previous.requestHash !== requestHash || previous.driverId !== driver.id) throw new DriverPortalError("Esta chave já foi utilizada com dados diferentes.");
      return previous;
    }
    const booking = await tx.booking.findFirst({ where: { id: bookingId, organizationId: context.organizationId, mode: "SANDBOX", occupancy: { driverId: driver.id, organizationId: context.organizationId, releasedAt: null } }, include: { occupancy: { include: { vehicle: true } }, service: true } });
    if (!booking) throw new AccessDenied();
    if (booking.version !== input.expectedVersion) throw new DriverPortalError("O serviço mudou. Atualize a página.");
    const now = new Date(), status = driverTransition(booking.status, input.type, booking.startsAt, booking.endsAt, now);
    // Refusal and closure remain possible under restriction; starting/accepting never bypass gates.
    if (input.type !== "DECLINE" && input.type !== "COMPLETE") {
      await assertSandboxBookingApproval(tx, context.organizationId, now);
      await assertSandboxBookingApproval(tx, context.organizationId, booking.endsAt);
      if (!booking.service.active || !booking.occupancy?.vehicle.active) throw new DriverPortalError("O serviço ou veículo está inativo. Contacte o operador.");
    }
    const version = booking.version + 1;
    const changed = await tx.booking.updateMany({ where: { id: bookingId, organizationId: context.organizationId, version: input.expectedVersion }, data: { status, version } });
    if (changed.count !== 1) throw new DriverPortalError("O serviço mudou. Atualize a página.");
    // Keep the entire reserved interval, including buffers, even on early completion or refusal.
    await tx.bookingEvent.create({ data: { organizationId: context.organizationId, bookingId, type: status, createdAt: now } });
    const action = await tx.driverAction.create({ data: { organizationId: context.organizationId, bookingId, driverId: driver.id, actorId: context.actorId, idempotencyKey, requestHash, bookingVersion: version, type: input.type, createdAt: now } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "driver.booking.changed", metadata: { bookingId, driverId: driver.id, type: input.type, version, mode: "SANDBOX" } } });
    return action;
  }, { isolationLevel: "ReadCommitted" });
}
