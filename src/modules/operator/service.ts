import "server-only";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { assertSandboxBookingApproval, ComplianceError, isDocumentValid } from "@/modules/compliance";
import { dashboardInput, dateOffset, listInput, periodBounds, reportInput, todayInZone } from "./domain";

const shellSelect = { id: true, name: true, timeZone: true, operator: { select: { status: true, primaryLanguage: true } } } as const;
async function authorize(organizationId: string) {
  const context = await currentTenant(organizationId); requirePermission(context, "organization:read"); return context;
}
export async function readOperatorShell(organizationId: string) {
  const context = await authorize(organizationId);
  const organization = await getDb().organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: shellSelect });
  return { organization, context };
}
export async function readOperatorDashboard(organizationId: string, raw: unknown = {}, now = new Date()) {
  const context = await authorize(organizationId), input = dashboardInput.parse(raw);
  return getDb().$transaction(async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: shellSelect });
    const date = input.date ?? todayInZone(organization.timeZone, now), interval = periodBounds(date, date, organization.timeZone);
    const where = { organizationId: context.organizationId, startsAt: { gte: interval.startsAt, lt: interval.endsAt } };
    const [total, confirmed, assigned, cancelled, driversWithWindows, bookings, next, requirements, resources, problems] = await Promise.all([
      tx.booking.count({ where: { ...where, status: { not: "CANCELLED" } } }),
      tx.booking.count({ where: { ...where, status: { in: ["CONFIRMED", "DRIVER_DECLINED"] } } }),
      tx.booking.count({ where: { ...where, status: { in: ["ASSIGNED", "DRIVER_ACCEPTED", "ARRIVED", "IN_PROGRESS", "COMPLETED"] } } }),
      tx.booking.count({ where: { ...where, status: "CANCELLED" } }),
      tx.driver.count({ where: { organizationId: context.organizationId, status: "ACTIVE", availability: { some: { organizationId: context.organizationId, active: true, startsAt: { lt: interval.endsAt }, endsAt: { gt: interval.startsAt } } } } }),
      tx.booking.findMany({ where, select: { id: true, serviceName: true, passengers: true, startsAt: true, status: true, customer: { select: { name: true } }, occupancy: { select: { driver: { select: { name: true } }, vehicle: { select: { name: true } } } } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 21, skip: (input.page - 1) * 20 }),
      tx.booking.findFirst({ where: { ...where, status: { notIn: ["CANCELLED", "COMPLETED"] }, startsAt: { gte: new Date(Math.max(now.valueOf(), interval.startsAt.valueOf())), lt: interval.endsAt } }, select: { id: true, serviceName: true, startsAt: true, status: true, passengers: true }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
      tx.complianceRequirement.findMany({ where: { organizationId: context.organizationId, active: true }, select: { id: true, requiresExpiry: true, documents: { orderBy: { revision: "desc" }, take: 1, select: { id: true, status: true, expiresOn: true } } } }),
      Promise.all([tx.service.count({ where: { organizationId: context.organizationId, active: true } }), tx.vehicle.count({ where: { organizationId: context.organizationId, active: true } }), tx.driver.count({ where: { organizationId: context.organizationId, status: "ACTIVE" } })]),
      // Inspect the latest decision first: an old failed attempt must not survive a later success.
      tx.$queryRaw<Array<{ id: string; serviceName: string; reason: string; total: bigint }>>`
        SELECT b."id", b."serviceName", CASE WHEN b."status" = 'DRIVER_DECLINED' THEN 'Motorista recusou. Redistribua ou cancele a reserva.' ELSE d."reason" END AS reason, COUNT(*) OVER() AS total
        FROM "Booking" b LEFT JOIN LATERAL (
          SELECT "outcome", "reason" FROM "DispatchDecision"
          WHERE "organizationId" = ${context.organizationId} AND "bookingId" = b."id"
          ORDER BY "bookingVersion" DESC, "id" DESC LIMIT 1
        ) d ON TRUE
        WHERE b."organizationId" = ${context.organizationId} AND b."status" <> 'CANCELLED'
          AND b."startsAt" >= ${interval.startsAt} AND b."startsAt" < ${interval.endsAt}
          AND (d."outcome" = 'NO_CANDIDATE' OR b."status" = 'DRIVER_DECLINED')
        ORDER BY b."startsAt", b."id" LIMIT 10`,
    ]);
    let canCreateTestBooking = true;
    try { await assertSandboxBookingApproval(tx, context.organizationId, now); }
    catch (error) { if (!(error instanceof ComplianceError)) throw error; canCreateTestBooking = false; }
    const attentionDocuments = requirements.filter((row) => !isDocumentValid({ ...row, document: row.documents[0] ?? null }, now) || row.documents[0]?.status !== "APPROVED").length;
    const nearExpiry = requirements.filter((row) => { const document = row.documents[0]; return document?.status === "APPROVED" && document.expiresOn && isDocumentValid({ ...row, document }, now) && document.expiresOn.toISOString().slice(0, 10) <= dateOffset(now.toISOString().slice(0, 10), 7); }).length;
    return { organization, context, date, checkedAt: now, page: input.page, hasNext: bookings.length > 20, bookings: bookings.slice(0, 20), next, stats: { total, confirmed, assigned, cancelled, driversWithWindows }, attentionDocuments, nearExpiry, canCreateTestBooking, resources: { services: resources[0], vehicles: resources[1], drivers: resources[2] }, problems: problems.map(({ total: _total, ...row }) => { void _total; return row; }), problemCount: Number(problems[0]?.total ?? 0n) };
  }, { isolationLevel: "RepeatableRead" });
}
export async function readOperatorCustomers(organizationId: string, raw: unknown = {}) {
  const context = await authorize(organizationId), input = listInput.parse(raw);
  const where = { organizationId: context.organizationId, ...(input.search ? { OR: [{ name: { contains: input.search, mode: "insensitive" as const } }, { email: { contains: input.search, mode: "insensitive" as const } }, { phone: { contains: input.search } }] } : {}) };
  return getDb().$transaction(async (tx) => {
    const [customers, total] = await Promise.all([
      tx.customer.findMany({ where, select: { id: true, name: true, email: true, phone: true, bookings: { where: { organizationId: context.organizationId }, select: { id: true, serviceName: true, startsAt: true }, take: 1, orderBy: { startsAt: "desc" } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (input.page - 1) * 20 }),
      tx.customer.count({ where }),
    ]);
    return { context, input, customers, total, hasNext: input.page * 20 < total };
  }, { isolationLevel: "RepeatableRead" });
}
export async function readOperatorReport(organizationId: string, raw?: unknown, now = new Date()) {
  const context = await authorize(organizationId);
  return getDb().$transaction(async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: shellSelect });
    const today = todayInZone(organization.timeZone, now), input = reportInput.parse(raw ?? { from: dateOffset(today, -6), until: today });
    const interval = periodBounds(input.from, input.until, organization.timeZone);
    const rows = await tx.$queryRaw<Array<{ date: string; status: import("@/generated/prisma/client").BookingStatus; count: bigint; passengers: bigint; value: bigint }>>`
      SELECT to_char("startsAt" AT TIME ZONE ${organization.timeZone}, 'YYYY-MM-DD') AS date, "status",
        COUNT(*) AS count, SUM("passengers")::bigint AS passengers, SUM("totalPriceCents")::bigint AS value
      FROM "Booking" WHERE "organizationId" = ${context.organizationId}
        AND "startsAt" >= ${interval.startsAt} AND "startsAt" < ${interval.endsAt}
      GROUP BY date, "status" ORDER BY date, "status"`;
    const days = Array.from({ length: Math.round((new Date(`${input.until}T00:00Z`).valueOf() - new Date(`${input.from}T00:00Z`).valueOf()) / 86400000) + 1 }, (_, index) => ({ date: dateOffset(input.from, index), active: 0, assigned: 0, cancelled: 0, passengers: 0, valueCents: 0n }));
    for (const row of rows) {
      const day = days.find((item) => item.date === row.date);
      if (!day) continue;
      if (row.status === "CANCELLED") day.cancelled += Number(row.count);
      else { day.active += Number(row.count); day.assigned += ["ASSIGNED", "DRIVER_ACCEPTED", "ARRIVED", "IN_PROGRESS", "COMPLETED"].includes(row.status) ? Number(row.count) : 0; day.passengers += Number(row.passengers); day.valueCents += row.value; }
    }
    const totals = days.reduce((sum, day) => ({ active: sum.active + day.active, assigned: sum.assigned + day.assigned, cancelled: sum.cancelled + day.cancelled, passengers: sum.passengers + day.passengers, valueCents: sum.valueCents + day.valueCents }), { active: 0, assigned: 0, cancelled: 0, passengers: 0, valueCents: 0n });
    return { organization, context, input, days, totals };
  }, { isolationLevel: "RepeatableRead" });
}
