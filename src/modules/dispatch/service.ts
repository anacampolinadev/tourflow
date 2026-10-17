import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { availabilityInTransaction, availabilityReasons, localLabel } from "@/modules/availability";
import { assertSandboxBookingApproval, ComplianceError } from "@/modules/compliance";
import { DispatchError, assertDispatchable, dispatchInput, rankCandidates, scoreCandidate, weights } from "./domain";

async function loadBooking(tx: Prisma.TransactionClient, organizationId: string, bookingId: string) {
  const booking = await tx.booking.findFirst({ where: { id: bookingId, organizationId }, include: { occupancy: { include: { driver: { select: { name: true } }, vehicle: { select: { name: true } } } } } });
  if (!booking) throw new DispatchError("Reserva não encontrada neste operador.");
  return booking;
}
type DispatchBooking = Awaited<ReturnType<typeof loadBooking>>;
async function candidates(tx: Prisma.TransactionClient, organizationId: string, booking: DispatchBooking) {
  assertDispatchable(booking.status);
  if (booking.mode !== "SANDBOX" || !booking.occupancy || booking.occupancy.releasedAt) throw new DispatchError("A reserva não tem uma ocupação de teste ativa.");
  await assertSandboxBookingApproval(tx, organizationId);
  await assertSandboxBookingApproval(tx, organizationId, booking.endsAt);
  const local = localLabel(booking.startsAt, booking.timeZone);
  const availability = await availabilityInTransaction(tx, organizationId, { serviceId: booking.serviceId, date: local.slice(0, 10), time: local.slice(11, 16), passengers: booking.passengers, ...(booking.language ? { language: booking.language } : {}) }, new Date(), { excludeBookingId: booking.id });
  if (availability.available && (availability.startsAt !== booking.startsAt.toISOString() || availability.endsAt !== booking.endsAt.toISOString() || availability.occupiedStartsAt !== booking.occupancy.startsAt.toISOString() || availability.occupiedEndsAt !== booking.occupancy.endsAt.toISOString())) throw new DispatchError("A configuração mudou o intervalo da reserva. Reveja a agenda antes de distribuir.");
  const from = new Date(booking.startsAt.valueOf() - 30 * 86400000), until = new Date(booking.startsAt.valueOf() + 86400000);
  const [vehicles, workload] = await Promise.all([
    tx.vehicle.findMany({ where: { organizationId, id: { in: availability.eligibleVehicles.map((row) => row.id) } }, select: { id: true, capacity: true }, orderBy: { id: "asc" } }),
    tx.bookingOccupancy.groupBy({ by: ["driverId"], where: { organizationId, bookingId: { not: booking.id }, releasedAt: null, booking: { status: "ASSIGNED", startsAt: { gte: from, lt: until } } }, _count: { _all: true } }),
  ]);
  const counts = new Map(workload.map((row) => [row.driverId, row._count._all]));
  const drivers = availability.eligibleDrivers.map((driver) => ({ ...driver, assignments: counts.get(driver.id) ?? 0 }));
  const ranking = rankCandidates(drivers, vehicles, booking.passengers, Boolean(booking.language));
  return { availability, vehicles, drivers, ranking, from, until };
}

export async function dispatchBooking(organizationId: string, bookingId: string, raw: unknown) {
  const context = await currentTenant(organizationId); requirePermission(context, "operations:manage");
  const input = dispatchInput.parse(raw);
  const { idempotencyKey, ...payload } = input;
  const requestHash = createHash("sha256").update(JSON.stringify({ bookingId, ...payload })).digest("hex");
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
    const previous = await tx.dispatchDecision.findUnique({ where: { organizationId_idempotencyKey: { organizationId: context.organizationId, idempotencyKey } } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new DispatchError("A chave de distribuição já foi usada com dados diferentes.");
      return previous;
    }
    const booking = await loadBooking(tx, context.organizationId, bookingId);
    if (booking.version !== input.expectedVersion) throw new DispatchError("A reserva mudou. Atualize a página.");
    const snapshot = await candidates(tx, context.organizationId, booking);
    let selected = snapshot.ranking[0];
    if (input.mode === "MANUAL") {
      const driver = snapshot.drivers.find((row) => row.id === input.driverId), vehicle = snapshot.vehicles.find((row) => row.id === input.vehicleId);
      if (!driver || !vehicle) throw new DispatchError("Escolha apenas recursos elegíveis deste operador. A atribuição anterior foi preservada.");
      selected = scoreCandidate(driver, vehicle, booking.passengers, Boolean(booking.language));
    }
    const outcome = selected ? "ASSIGNED" : "NO_CANDIDATE";
    const reason = selected ? input.mode === "MANUAL" ? input.reason : `Maior pontuação elegível; ${selected.assignments} atribuições na janela de carga e ${selected.capacity - booking.passengers} lugares livres. Desempate por carga e identificadores.` : availabilityReasons[snapshot.availability.reason];
    const version = booking.version + 1;
    if (selected) {
      await tx.bookingOccupancy.update({ where: { bookingId, organizationId: context.organizationId }, data: { driverId: selected.driverId, vehicleId: selected.vehicleId } });
      await tx.bookingEvent.create({ data: { organizationId: context.organizationId, bookingId, type: "ASSIGNED" } });
    }
    const changed = await tx.booking.updateMany({ where: { id: bookingId, organizationId: context.organizationId, version: input.expectedVersion }, data: { version, ...(selected ? { status: "ASSIGNED" } : {}) } });
    if (changed.count !== 1) throw new DispatchError("A reserva mudou. Atualize a página.");
    const decision = await tx.dispatchDecision.create({ data: {
      organizationId: context.organizationId, bookingId, actorId: context.actorId, idempotencyKey, requestHash, bookingVersion: version, mode: input.mode, outcome,
      driverId: selected?.driverId, vehicleId: selected?.vehicleId, score: selected?.score, reason,
      factors: { algorithm: "fair-v1", weights, neutral: ["proximity", "rating", "acceptance"], resourceDocuments: "NOT_IMPLEMENTED_SANDBOX", workloadFrom: snapshot.from.toISOString(), workloadUntil: snapshot.until.toISOString(), drivers: snapshot.drivers.map(({ id, assignments }) => ({ id, assignments })), vehicles: snapshot.vehicles, ranking: snapshot.ranking, ...(selected ? { selected } : {}), previous: { driverId: booking.occupancy?.driverId ?? null, vehicleId: booking.occupancy?.vehicleId ?? null }, availabilityReason: snapshot.availability.reason },
    } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "dispatch.decided", metadata: { bookingId, decisionId: decision.id, outcome, mode: input.mode, version } } });
    return decision;
  }, { isolationLevel: "ReadCommitted", timeout: 10000 });
}

export async function readDispatch(organizationId: string, bookingId: string) {
  const context = await currentTenant(organizationId); requirePermission(context, "organization:read");
  return getDb().$transaction(async (tx) => {
    const booking = await loadBooking(tx, context.organizationId, bookingId);
    const decisions = await tx.dispatchDecision.findMany({ where: { organizationId: context.organizationId, bookingId }, include: { driver: { select: { name: true } }, vehicle: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
    try {
      return { context, booking, decisions, preview: await candidates(tx, context.organizationId, booking), unavailable: null };
    } catch (error) {
      if (!(error instanceof DispatchError || error instanceof ComplianceError)) throw error;
      return { context, booking, decisions, preview: null, unavailable: error.message };
    }
  }, { isolationLevel: "RepeatableRead" });
}
