import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `driver-ui-${suffix}@example.test`, outsiderEmail = `driver-ui-out-${suffix}@example.test`;
let driverEmail = "", driverId = "";
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
  const row = await db.organization.create({ data: { name: "Sintra Distribuição", slug: `driver-ui-${suffix}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } });
  org = row.id; orgs.push(org);
  await db.complianceRequirement.create({ data: { organizationId: org, title: "Approved fixture", requiresExpiry: false, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: ownerId, status: "APPROVED" } } } });
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Tour da Serra", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Estação de Sintra", languages: ["pt", "en"], active: true } })).id;
  const vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Jipe", type: "JEEP", registration: "BKUI01", capacity: 6, features: [], active: true } })).id;
  driverEmail = `driver-account-ui-${suffix}@example.test`;
  driverId = (await db.driver.create({ data: { organizationId: org, name: "Motorista", email: driverEmail, phone: "+351912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
  manualVehicle = (await db.vehicle.create({ data: { organizationId: org, name: "Carrinha de apoio", type: "VAN", registration: "DPUI02", capacity: 8, features: [], active: true } })).id;
  manualDriver = (await db.driver.create({ data: { organizationId: org, name: "Maria da Serra", email: `manual-${suffix}@example.test`, phone: "+351912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
  await db.user.create({ data: { email: driverEmail } });
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
    if (hour === 10) {
      bookingId = booking.id;
      const now = Date.now();
      await db.booking.update({ where: { id: booking.id }, data: { status: "ASSIGNED", startsAt: new Date(now - 60000), endsAt: new Date(now + 7200000) } });
      await db.bookingOccupancy.update({ where: { bookingId: booking.id }, data: { startsAt: new Date(now - 900000), endsAt: new Date(now + 8100000) } });
    } else { privateBookingId = booking.id; await db.booking.update({ where: { id: booking.id }, data: { status: "ASSIGNED" } }); }
  }
});
test.afterAll(async () => {
  const where = { organizationId: { in: orgs } };
  await db.driverAction.deleteMany({ where }); await db.dispatchDecision.deleteMany({ where }); await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, outsiderEmail, driverEmail] } } }); await db.user.deleteMany({ where: { email: { in: [email, outsiderEmail, driverEmail] } } }); await db.$disconnect();
});


test("owner explicitly enables access; driver logs in and completes the mobile journey", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, email);
  await page.goto(`/operator/${org}/drivers/${driverId}`);
  await page.getByRole("button", { name: "Ativar acesso do motorista", exact: true }).click();
  await expect(page.getByText("Conta associada.", { exact: false })).toBeVisible();
  expect((await db.driver.findUniqueOrThrow({ where: { id: driverId } })).userId).not.toBeNull();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), driverPage = await context.newPage();
  driverPage.on("pageerror", error => errors.push(error.message));
  driverPage.on("console", message => { if (message.type() === "error" && !message.text().includes("net::ERR_INTERNET_DISCONNECTED") && !message.text().includes("503")) errors.push(message.text()); });
  await login(driverPage, driverEmail); await driverPage.getByRole("link", { name: /motorista$/ }).click();
  await expect(driverPage.getByRole("heading", { name: "Olá, João da Serra" })).toBeVisible();
  expect(await driverPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const card = driverPage.getByRole("article").filter({ hasText: "Cliente Distribuição" });
  await expect(card).toBeVisible(); await expect(card).not.toContainText("private-dispatch-ui@example.test");
  await expect(card.getByRole("link", { name: "Abrir rota no mapa" })).toHaveAttribute("href", /destination=Sintra/);
  await driverPage.screenshot({ path: "test-results/driver-mobile.png", fullPage: true, caret: "initial" });
  for (const [name, status] of [["Aceitar serviço", "DRIVER_ACCEPTED"], ["Cheguei ao encontro", "ARRIVED"], ["Passageiros a bordo — iniciar", "IN_PROGRESS"]] as const) {
    await card.getByRole("button", { name, exact: true }).click();
    await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(status);
    await expect(card).toContainText(status === "DRIVER_ACCEPTED" ? "Aceite em teste" : status === "ARRIVED" ? "No encontro em teste" : "Em curso em teste");
  }
  await driverPage.screenshot({ path: "test-results/driver-in-progress.png", fullPage: true, caret: "initial" });
  await card.getByRole("button", { name: "Concluir serviço", exact: true }).click();
  await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("COMPLETED");
  await expect(driverPage.getByRole("article").filter({ hasText: "Cliente Distribuição" })).toHaveCount(0);
  await driverPage.getByRole("link", { name: "Concluídos", exact: true }).click();
  await expect(driverPage.getByText("Concluída em teste", { exact: true })).toBeVisible();
  expect(await db.driverAction.count({ where: { bookingId } })).toBe(4);
  expect((await db.bookingOccupancy.findUniqueOrThrow({ where: { bookingId } })).releasedAt).toBeNull();
  // Service worker provides only a generic failed-navigation response, never a private cache.
  await driverPage.evaluate(async () => { await navigator.serviceWorker.ready; });
  await driverPage.reload();
  await expect.poll(() => driverPage.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await driverPage.evaluate(() => caches.keys())).toEqual([]);
  await context.setOffline(true); await driverPage.reload();
  await expect(driverPage.getByRole("heading", { name: "Sem ligação", exact: true })).toBeVisible();
  await expect(driverPage.locator("body")).not.toContainText("Cliente Distribuição");
  await context.setOffline(false); await driverPage.reload();
  await expect(driverPage.getByRole("heading", { name: "Olá, João da Serra" })).toBeVisible();
  const manifest = await driverPage.request.get("/driver/manifest.webmanifest"); expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ display: "standalone", scope: "/driver" });
  const privateResponse = await driverPage.request.get(`/driver/${org}`);
  expect(privateResponse.headers()["cache-control"]).toContain("no-store");
  expect(errors).toEqual([]);
  driverPage.removeAllListeners("console");
  expect((await driverPage.goto(`/operator/${org}/bookings`))?.status()).toBe(404);
  await context.close(); expect(errors).toEqual([]);
});

test("refusal leaves a visible operator exception and only another driver can be selected", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await login(page, driverEmail); await page.goto(`/driver/${org}`);
  const card = page.getByRole("article").filter({ hasText: "Cliente Privado" });
  await card.getByText("Recusar serviço", { exact: true }).click();
  await card.getByRole("button", { name: "Confirmar recusa", exact: true }).click();
  await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: privateBookingId } })).status).toBe("DRIVER_DECLINED");
  await expect(page.getByRole("article").filter({ hasText: "Cliente Privado" })).toHaveCount(0);
  const context = await browser.newContext(), operator = await context.newPage(); await login(operator, email);
  await operator.goto(`/operator/${org}?date=${date}`);
  await expect(operator.getByText("Motorista recusou. Redistribua ou cancele a reserva.", { exact: true })).toBeVisible();
  await operator.goto(path(privateBookingId));
  await operator.getByText("Escolher manualmente", { exact: true }).click();
  await expect(operator.getByLabel("Motorista elegível").locator(`option[value="${driverId}"]`)).toHaveCount(0);
  await operator.getByLabel("Motorista elegível").selectOption(manualDriver);
  await operator.getByLabel("Veículo elegível").selectOption(manualVehicle);
  await operator.getByLabel("Justificação").fill("Redistribuição após recusa no teste interno");
  await operator.getByRole("button", { name: "Guardar atribuição manual", exact: true }).click();
  await expect.poll(async () => (await db.bookingOccupancy.findUniqueOrThrow({ where: { bookingId: privateBookingId } })).driverId).toBe(manualDriver);
  await page.reload(); await expect(page.getByText("Cliente Privado", { exact: true })).toHaveCount(0);
  await context.close();
});

test("anonymous and unrelated users cannot read private driver pages", async ({ page }) => {
  await page.goto(`/driver/${org}`); await expect(page).toHaveURL(/\/login$/);
  await login(page, outsiderEmail);
  expect((await page.goto(`/driver/${org}`))?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText("João da Serra");
});
