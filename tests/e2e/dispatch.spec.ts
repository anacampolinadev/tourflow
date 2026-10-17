import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `dispatch-ui-${suffix}@example.test`, outsiderEmail = `dispatch-ui-out-${suffix}@example.test`;
const orgs: string[] = [];
let org = "", ownerId = "", serviceId = "", bookingId = "", privateBookingId = "", manualDriver = "", manualVehicle = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const path = (id = bookingId) => `/operator/${org}/dispatch/${id}`;
async function login(page: Page, email: string) {
  const schema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
  const search = async () => schema.parse(await (await page.request.get("http://localhost:8025/api/v1/search", { params: { query: `to:${email}` } })).json()).messages;
  const before = new Set((await search()).map((message) => message.ID));
  await page.goto("/login"); await page.getByLabel("E-mail", { exact: true }).fill(email); await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  let id: string | undefined;
  await expect.poll(async () => { id = (await search()).find((message) => !before.has(message.ID))?.ID; return id; }).toBeTruthy();
  const { Text } = z.object({ Text: z.string() }).parse(await (await page.request.get(`http://localhost:8025/api/v1/message/${id}`)).json());
  const link = Text.match(/http:\/\/localhost:3100\/api\/auth\/callback\/nodemailer[^\s]+/)?.[0];
  if (!link) throw new Error("Verification email missing.");
  await page.goto(link); await expect(page).toHaveURL(/\/workspace$/);
}

test.beforeAll(async () => {
  await db.user.createMany({ data: [{ email }, { email: outsiderEmail }] });
  ownerId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  const row = await db.organization.create({ data: { name: "Sintra Distribuição", slug: `dispatch-ui-${suffix}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } });
  org = row.id; orgs.push(org);
  await db.complianceRequirement.create({ data: { organizationId: org, title: "Approved fixture", requiresExpiry: false, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: ownerId, status: "APPROVED" } } } });
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Tour da Serra", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Estação de Sintra", languages: ["pt", "en"], active: true } })).id;
  const vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Jipe", type: "JEEP", registration: "BKUI01", capacity: 6, features: [], active: true } })).id;
  const driverId = (await db.driver.create({ data: { organizationId: org, name: "Motorista", email: `driver-ui-${suffix}@example.test`, phone: "+351912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
  manualVehicle = (await db.vehicle.create({ data: { organizationId: org, name: "Carrinha de apoio", type: "VAN", registration: "DPUI02", capacity: 8, features: [], active: true } })).id;
  manualDriver = (await db.driver.create({ data: { organizationId: org, name: "Maria da Serra", email: `manual-${suffix}@example.test`, phone: "+351912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
  await db.driver.update({ where: { id: driverId }, data: { name: "João da Serra" } });
  await db.serviceVehicle.create({ data: { organizationId: org, serviceId, vehicleId: manualVehicle } });
  await db.driverAvailability.create({ data: { organizationId: org, driverId: manualDriver, startsAt: new Date(`${date}T00:00Z`), endsAt: new Date(`${date}T23:59Z`) } });
  await db.serviceVehicle.create({ data: { organizationId: org, serviceId, vehicleId } });
  await db.serviceSchedule.create({ data: { organizationId: org, serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, departureMinutes: 600, validFrom: new Date(`${date}T00:00Z`), validUntil: new Date(`${date}T00:00Z`), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } });
  await db.driverAvailability.create({ data: { organizationId: org, driverId, startsAt: new Date(`${date}T00:00Z`), endsAt: new Date(`${date}T23:59Z`) } });
  await db.serviceSchedule.create({ data: { organizationId: org, serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, departureMinutes: 840, validFrom: new Date(`${date}T00:00Z`), validUntil: new Date(`${date}T00:00Z`), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } });
  for (const hour of [10, 14]) {
    const start = Temporal.PlainDateTime.from(`${date}T${hour}:00`).toZonedDateTime("Europe/Lisbon").epochMilliseconds;
    const customer = await db.customer.create({ data: { organizationId: org, name: hour === 10 ? "Cliente Distribuição" : "Cliente Privado", email: "private-dispatch-ui@example.test", phone: "+351912345678" } });
    const booking = await db.booking.create({ data: { organizationId: org, serviceId, customerId: customer.id, idempotencyKey: randomUUID(), requestHash: "fixture", passengers: 4, language: "en", startsAt: new Date(start), endsAt: new Date(start + 120 * 60000), timeZone: "Europe/Lisbon", serviceName: "Tour da Serra", pricingType: "PER_PERSON", unitPriceCents: 4990, totalPriceCents: 19960, currency: "EUR", meetingPoint: "Sintra", pickupRules: "", pickup: "", notes: "", source: "OPERATOR" } });
    await db.bookingOccupancy.create({ data: { organizationId: org, bookingId: booking.id, vehicleId, driverId, startsAt: new Date(start - 15 * 60000), endsAt: new Date(start + 135 * 60000) } });
    await db.bookingEvent.create({ data: { organizationId: org, bookingId: booking.id, type: "CONFIRMED" } });
    if (hour === 10) bookingId = booking.id; else privateBookingId = booking.id;
  }
});
test.afterAll(async () => {
  const where = { organizationId: { in: orgs } };
  await db.dispatchDecision.deleteMany({ where }); await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, outsiderEmail] } } }); await db.user.deleteMany({ where: { email: { in: [email, outsiderEmail] } } }); await db.$disconnect();
});

test("automatic recommendation, justified manual reassignment and cancellation preserve history", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await login(page, email); await page.goto(path());
  await expect(page.getByRole("heading", { name: "Distribuição interna", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Distribuir automaticamente", exact: true }).click();
  const version = async () => (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).version;
  await expect.poll(version).toBe(1);
  await expect(page.getByRole("button", { name: "Distribuir automaticamente", exact: true })).toBeEnabled();
  await expect(page.getByText("Atribuição automática", { exact: true })).toBeVisible();
  expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("ASSIGNED");
  await page.getByText("Escolher manualmente", { exact: true }).click();
  await page.getByLabel("Motorista elegível").selectOption(manualDriver); await page.getByLabel("Veículo elegível").selectOption(manualVehicle);
  await page.getByLabel("Justificação").fill("Reorganização interna para o grupo de teste");
  await page.getByRole("button", { name: "Guardar atribuição manual", exact: true }).click();
  await expect.poll(version).toBe(2);
  await expect(page.getByText("Atribuição manual", { exact: true })).toBeVisible();
  expect(await db.bookingOccupancy.findUniqueOrThrow({ where: { bookingId } })).toMatchObject({ driverId: manualDriver, vehicleId: manualVehicle, releasedAt: null });
  await page.goto(path()); await page.screenshot({ path: "test-results/dispatch.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/dispatch-mobile.png", fullPage: true });
  await page.goto(`/operator/${org}/bookings`);
  const card = page.getByRole("article", { name: "Reserva de Cliente Distribuição", exact: true });
  await expect(card).toContainText("Atribuída em teste"); await expect(card).toContainText("Maria da Serra");
  await card.getByRole("button", { name: "Cancelar reserva", exact: true }).click();
  await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("CANCELLED");
  await page.goto(path()); await expect(page.getByRole("button", { name: "Distribuir automaticamente", exact: true })).toHaveCount(0);
  await expect(page.getByText("Atribuição automática", { exact: true })).toBeVisible(); await expect(page.getByText("Atribuição manual", { exact: true })).toBeVisible();
  expect((await db.bookingOccupancy.findUniqueOrThrow({ where: { bookingId } })).releasedAt).not.toBeNull(); expect(errors).toEqual([]);
});

test("viewer reads decisions but cannot assign, while other users cannot read the booking", async ({ page, browser }) => {
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_VIEWER" } });
  await login(page, email); await page.goto(path(privateBookingId));
  await expect(page.getByText("Modo de leitura.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Distribuir automaticamente", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar atribuição manual", exact: true })).toHaveCount(0);
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(path(privateBookingId)); await expect(other).toHaveURL(/\/login$/); await login(other, outsiderEmail);
  expect((await other.goto(path(privateBookingId)))?.status()).toBe(404); await expect(other.getByText("Tour da Serra", { exact: true })).toHaveCount(0); await context.close();
});
