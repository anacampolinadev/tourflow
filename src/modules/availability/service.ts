import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { CatalogConflict, lockOperatorCatalog, recordVersion } from "@/modules/tenants";
import { AvailabilityError, MAX_CALENDAR_ENTRIES, availabilityInput, blockInput, dateOnly, dayInterval, driverWindowInput, intervalFromLocal, linkInput, localDate, localToDate, minuteOfDay, scheduleInput, timeZoneInput, tomorrowLocalDate } from "./domain";
import { evaluateAvailability } from "./engine";

type CalendarKind = "schedule" | "window" | "block" | "link";
async function write<T>(organizationId: string, version: number, kind: CalendarKind | "zone", work: (tx: Prisma.TransactionClient, timeZone: string) => Promise<T>) {
  const context = await currentTenant(organizationId);
  requirePermission(context, kind === "schedule" || kind === "link" || kind === "zone" ? "catalog:manage" : "resources:manage");
  recordVersion.parse(version);
  return getDb().$transaction(async (tx) => {
    await lockOperatorCatalog(tx, context.organizationId);
    const changed = await tx.operatorProfile.updateMany({ where: { organizationId: context.organizationId, calendarVersion: version }, data: { calendarVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new CatalogConflict();
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { timeZone: true } });
    const result = await work(tx, organization.timeZone);
    const entryId = result && typeof result === "object" && "id" in result && typeof result.id === "string" ? result.id : null;
    const active = result && typeof result === "object" && "active" in result && typeof result.active === "boolean" ? result.active : null;
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: `calendar.${kind}.changed`, metadata: { calendarVersion: version + 1, ...(entryId ? { entryId } : {}), ...(active === null ? {} : { active }) } } });
    return result;
  });
}
export async function setCalendarTimeZone(organizationId: string, version: number, raw: unknown) {
  const timeZone = timeZoneInput.parse(raw);
  return write(organizationId, version, "zone", async (tx) => { await tx.organization.update({ where: { id: organizationId }, data: { timeZone } }); });
}
export async function addServiceSchedule(organizationId: string, version: number, raw: unknown) {
  const input = scheduleInput.parse(raw);
  return write(organizationId, version, "schedule", async (tx) => {
    if (!await tx.service.findFirst({ where: { id: input.serviceId, organizationId } })) throw new CatalogConflict();
    if (await tx.serviceSchedule.count({ where: { organizationId, active: true } }) >= MAX_CALENDAR_ENTRIES) throw new AvailabilityError("Limite de 500 saídas ativas por operador.");
    const validFrom = dateOnly(input.validFrom), validUntil = dateOnly(input.validUntil), departureMinutes = minuteOfDay(input.time);
    if (await tx.serviceSchedule.findFirst({ where: { organizationId, serviceId: input.serviceId, weekday: input.weekday, departureMinutes, active: true, validFrom: { lte: validUntil }, validUntil: { gte: validFrom } } })) throw new AvailabilityError("Já existe uma saída nesse dia/hora durante o período indicado.");
    const { time: _time, ...fields } = input;
    void _time;
    return tx.serviceSchedule.create({ data: { ...fields, organizationId, departureMinutes, validFrom, validUntil } });
  });
}
export async function linkServiceVehicle(organizationId: string, version: number, raw: unknown) {
  const input = linkInput.parse(raw);
  return write(organizationId, version, "link", async (tx) => {
    const [service, vehicle] = await Promise.all([tx.service.findFirst({ where: { id: input.serviceId, organizationId } }), tx.vehicle.findFirst({ where: { id: input.vehicleId, organizationId } })]);
    if (!service || !vehicle) throw new CatalogConflict();
    const previous = await tx.serviceVehicle.findUnique({ where: { organizationId_serviceId_vehicleId: { organizationId, ...input } } });
    if (previous?.active) throw new AvailabilityError("O veículo já está associado ao serviço.");
    if (await tx.serviceVehicle.count({ where: { organizationId, active: true } }) >= MAX_CALENDAR_ENTRIES) throw new AvailabilityError("Limite de 500 associações ativas por operador.");
    return tx.serviceVehicle.upsert({ where: { organizationId_serviceId_vehicleId: { organizationId, ...input } }, create: { organizationId, ...input }, update: { active: true } });
  });
}
export async function addDriverWindow(organizationId: string, version: number, raw: unknown) {
  const input = driverWindowInput.parse(raw);
  return write(organizationId, version, "window", async (tx, zone) => {
    if (!await tx.driver.findFirst({ where: { id: input.driverId, organizationId } })) throw new CatalogConflict();
    if (await tx.driverAvailability.count({ where: { organizationId, active: true } }) >= MAX_CALENDAR_ENTRIES) throw new AvailabilityError("Limite de 500 janelas ativas por operador.");
    const interval = intervalFromLocal(input.startLocal, input.endLocal, zone);
    if (await tx.driverAvailability.findFirst({ where: { organizationId, driverId: input.driverId, active: true, startsAt: { lt: interval.endsAt }, endsAt: { gt: interval.startsAt } } })) throw new AvailabilityError("A janela sobrepõe outra janela ativa do motorista.");
    return tx.driverAvailability.create({ data: { organizationId, driverId: input.driverId, ...interval } });
  });
}
export async function addResourceBlock(organizationId: string, version: number, raw: unknown) {
  const input = blockInput.parse(raw);
  return write(organizationId, version, "block", async (tx, zone) => {
    const resource = input.resourceType === "vehicle" ? await tx.vehicle.findFirst({ where: { id: input.resourceId, organizationId } }) : await tx.driver.findFirst({ where: { id: input.resourceId, organizationId } });
    if (!resource) throw new CatalogConflict();
    if (await tx.resourceBlock.count({ where: { organizationId, active: true } }) >= MAX_CALENDAR_ENTRIES) throw new AvailabilityError("Limite de 500 bloqueios ativos por operador.");
    return tx.resourceBlock.create({ data: { organizationId, vehicleId: input.resourceType === "vehicle" ? input.resourceId : null, driverId: input.resourceType === "driver" ? input.resourceId : null, reason: input.reason, ...intervalFromLocal(input.startLocal, input.endLocal, zone) } });
  });
}
export async function deactivateCalendarEntry(organizationId: string, version: number, kind: CalendarKind, id: string) {
  if (!["schedule", "window", "block", "link"].includes(kind)) throw new CatalogConflict();
  return write(organizationId, version, kind, async (tx) => {
    const where = { id, organizationId, active: true };
    const result = kind === "schedule" ? await tx.serviceSchedule.updateMany({ where, data: { active: false } }) : kind === "window" ? await tx.driverAvailability.updateMany({ where, data: { active: false } }) : kind === "block" ? await tx.resourceBlock.updateMany({ where, data: { active: false } }) : await tx.serviceVehicle.updateMany({ where, data: { active: false } });
    if (result.count !== 1) throw new CatalogConflict();
    return { id, active: false };
  });
}
export async function readCalendar(organizationId: string, date?: string) {
  const context = await currentTenant(organizationId); requirePermission(context, "organization:read");
  return getDb().$transaction(async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { id: true, name: true, timeZone: true, operator: { select: { status: true, calendarVersion: true } } } });
    if (!organization.operator) return null;
    const selectedDate = date === undefined ? tomorrowLocalDate(organization.timeZone) : localDate.parse(date);
    const { startsAt: from, endsAt: until } = dayInterval(selectedDate, organization.timeZone);
    const [services, vehicles, drivers, schedules, links, windows, blocks] = await Promise.all([
      tx.service.findMany({ where: { organizationId }, select: { id: true, name: true, active: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
      tx.vehicle.findMany({ where: { organizationId }, select: { id: true, name: true, active: true, registration: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
      tx.driver.findMany({ where: { organizationId }, select: { id: true, name: true, status: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
      tx.serviceSchedule.findMany({ where: { organizationId, active: true }, orderBy: [{ weekday: "asc" }, { departureMinutes: "asc" }, { id: "asc" }] }),
      tx.serviceVehicle.findMany({ where: { organizationId, active: true }, orderBy: { id: "asc" } }),
      tx.driverAvailability.findMany({ where: { organizationId, active: true, startsAt: { lt: until }, endsAt: { gt: from } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
      tx.resourceBlock.findMany({ where: { organizationId, active: true, startsAt: { lt: until }, endsAt: { gt: from } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
    ]);
    return { organization, context, date: selectedDate, services, vehicles, drivers, schedules, links, windows, blocks };
  }, { isolationLevel: "RepeatableRead" });
}
export async function checkAvailability(organizationId: string, raw: unknown) {
  const context = await currentTenant(organizationId); requirePermission(context, "organization:read");
  const input = availabilityInput.parse(raw), now = new Date();
  return getDb().$transaction(async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { timeZone: true, operator: { select: { status: true } } } });
    const start = localToDate(`${input.date}T${input.time}`, organization.timeZone), from = new Date(start.valueOf() - 86400000), until = new Date(start.valueOf() + 10 * 86400000);
    const [service, schedules, links, drivers, windows, blocks] = await Promise.all([
      tx.service.findFirst({ where: { id: input.serviceId, organizationId }, select: { id: true, organizationId: true, active: true, durationMinutes: true, capacity: true, languages: true } }),
      tx.serviceSchedule.findMany({ where: { organizationId, serviceId: input.serviceId, active: true } }),
      tx.serviceVehicle.findMany({ where: { organizationId, serviceId: input.serviceId, active: true }, select: { vehicle: { select: { id: true, organizationId: true, name: true, active: true, capacity: true } } } }),
      tx.driver.findMany({ where: { organizationId }, select: { id: true, organizationId: true, name: true, status: true, languages: true } }),
      tx.driverAvailability.findMany({ where: { organizationId, active: true, startsAt: { lt: until }, endsAt: { gt: from } } }),
      tx.resourceBlock.findMany({ where: { organizationId, active: true, startsAt: { lt: until }, endsAt: { gt: from } } }),
    ]);
    return evaluateAvailability({ organizationId, timeZone: organization.timeZone, operatorStatus: organization.operator?.status ?? "LEAD", service, schedules, vehicles: links.map((link) => link.vehicle), drivers, windows, blocks }, input, now);
  }, { isolationLevel: "RepeatableRead" });
}
