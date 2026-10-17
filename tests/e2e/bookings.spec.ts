import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `booking-ui-${suffix}@example.test`, outsiderEmail = `booking-ui-out-${suffix}@example.test`;
const orgs: string[] = [];
let org = "", ownerId = "", serviceId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const path = () => `/operator/${org}/bookings`;
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
  const row = await db.organization.create({ data: { name: "Sintra Reservas", slug: `booking-ui-${suffix}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } });
  org = row.id; orgs.push(org);
  await db.complianceRequirement.create({ data: { organizationId: org, title: "Approved fixture", requiresExpiry: false, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: ownerId, status: "APPROVED" } } } });
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Tour da Serra", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Estação de Sintra", languages: ["pt", "en"], active: true } })).id;
  const vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Jipe", type: "JEEP", registration: "BKUI01", capacity: 6, features: [], active: true } })).id;
  const driverId = (await db.driver.create({ data: { organizationId: org, name: "Motorista", email: `driver-ui-${suffix}@example.test`, phone: "+351912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
  await db.serviceVehicle.create({ data: { organizationId: org, serviceId, vehicleId } });
  await db.serviceSchedule.create({ data: { organizationId: org, serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, departureMinutes: 600, validFrom: new Date(`${date}T00:00Z`), validUntil: new Date(`${date}T00:00Z`), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } });
  await db.driverAvailability.create({ data: { organizationId: org, driverId, startsAt: new Date(`${date}T00:00Z`), endsAt: new Date(`${date}T23:59Z`) } });
});
test.afterAll(async () => {
  const where = { organizationId: { in: orgs } };
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, outsiderEmail] } } }); await db.user.deleteMany({ where: { email: { in: [email, outsiderEmail] } } }); await db.$disconnect();
});
async function fill(page: Page) {
  if (!await page.getByRole("button", { name: "Confirmar reserva de teste", exact: true }).isVisible()) await page.getByText("Nova reserva de teste", { exact: true }).click();
  await page.getByLabel("Serviço", { exact: true }).selectOption(serviceId); await page.getByLabel("Data", { exact: true }).fill(date);
  await page.getByLabel("Hora de saída").fill("10:00"); await page.getByLabel("Passageiros").fill("4"); await page.getByLabel("Idioma pedido").selectOption("en");
  await page.getByLabel("Nome do cliente").fill("Cliente de Teste"); await page.getByLabel("E-mail do cliente").fill("cliente@example.test"); await page.getByLabel("Telefone do cliente").fill("+351912345678");
}

test("real authenticated booking, failed conflict, cancellation and freed capacity", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await login(page, email); await page.goto(path()); await fill(page);
  // Client-facing gates are never skipped by UI/server actions.
  await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "ONBOARDING" } });
  await page.getByRole("button", { name: "Confirmar reserva de teste", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("aprovação documental");
  await expect(page.getByLabel("Nome do cliente")).toHaveValue("Cliente de Teste");
  await expect(page.getByLabel("Serviço", { exact: true })).toHaveValue(serviceId);
  await expect(page.getByLabel("Passageiros")).toHaveValue("4");
  expect(await db.booking.count({ where: { organizationId: org } })).toBe(0);
  await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
  await page.getByRole("button", { name: "Confirmar reserva de teste", exact: true }).click();
  await expect.poll(() => db.booking.count({ where: { organizationId: org } })).toBe(1);
  await expect(page.getByRole("article")).toContainText("Confirmada em teste");
  await expect(page.getByRole("article")).toContainText("199,60");
  await page.goto(path()); await fill(page); await page.getByRole("button", { name: "Confirmar reserva de teste", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Sem veículo");
  expect(await db.booking.count({ where: { organizationId: org } })).toBe(1);
  await page.getByRole("button", { name: "Cancelar reserva", exact: true }).click();
  await expect.poll(() => db.booking.count({ where: { organizationId: org, status: "CANCELLED" } })).toBe(1);
  await expect(page.getByRole("button", { name: "Cancelar reserva", exact: true })).toHaveCount(0);
  await page.goto(path()); await fill(page); await page.getByRole("button", { name: "Confirmar reserva de teste", exact: true }).click();
  await expect.poll(() => db.booking.count({ where: { organizationId: org } })).toBe(2);
  await expect(page.getByRole("article")).toHaveCount(2);
  if (await page.getByRole("button", { name: "Confirmar reserva de teste", exact: true }).isVisible()) await page.getByText("Nova reserva de teste", { exact: true }).click();
  await page.screenshot({ path: "test-results/bookings.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/bookings-mobile.png", fullPage: true, caret: "initial" }); expect(errors).toEqual([]);
});

test("viewer reads without write actions and outsiders cannot see customer data", async ({ page, browser }) => {
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_VIEWER" } });
  await login(page, email); await page.goto(path()); await expect(page.getByText("Modo de leitura.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar reserva de teste", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancelar reserva", exact: true })).toHaveCount(0);
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(path()); await expect(other).toHaveURL(/\/login$/); await login(other, outsiderEmail);
  expect((await other.goto(path()))?.status()).toBe(404); await expect(other.getByText("cliente@example.test")).toHaveCount(0); await context.close();
});
