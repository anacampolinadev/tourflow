import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `dashboard-ui-${suffix}@example.test`, outsiderEmail = `dashboard-ui-out-${suffix}@example.test`;
const orgs: string[] = [];
let org = "", ownerId = "", serviceId = "", bookingId = "", privateBookingId = "", manualDriver = "", manualVehicle = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 1 }).toString();
const path = () => `/operator/${org}?date=${date}`;
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
  const row = await db.organization.create({ data: { name: "Sintra Operações", slug: `dashboard-ui-${suffix}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } });
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
  for (const hour of [10, 14, 17]) {
    const start = Temporal.PlainDateTime.from(`${date}T${hour}:00`).toZonedDateTime("Europe/Lisbon").epochMilliseconds;
    const customer = await db.customer.create({ data: { organizationId: org, name: hour === 10 ? "Mariana Teste" : hour === 14 ? "Ricardo Teste" : "Reserva Cancelada", email: "private-dispatch-ui@example.test", phone: "+351912345678" } });
    const booking = await db.booking.create({ data: { organizationId: org, serviceId, customerId: customer.id, idempotencyKey: randomUUID(), requestHash: "fixture", version: hour === 14 ? 1 : 0, status: hour === 14 ? "ASSIGNED" : hour === 17 ? "CANCELLED" : "CONFIRMED", passengers: 4, language: "en", startsAt: new Date(start), endsAt: new Date(start + 120 * 60000), timeZone: "Europe/Lisbon", serviceName: "Tour da Serra", pricingType: "PER_PERSON", unitPriceCents: 4990, totalPriceCents: 19960, currency: "EUR", meetingPoint: "Sintra", pickupRules: "", pickup: "", notes: "", source: "OPERATOR" } });
    if (hour !== 17) await db.bookingOccupancy.create({ data: { organizationId: org, bookingId: booking.id, vehicleId, driverId, startsAt: new Date(start - 15 * 60000), endsAt: new Date(start + 135 * 60000) } });
    await db.bookingEvent.create({ data: { organizationId: org, bookingId: booking.id, type: "CONFIRMED" } });
    if (hour === 10) bookingId = booking.id;
    else if (hour === 14) { privateBookingId = booking.id; await db.dispatchDecision.create({ data: { organizationId: org, bookingId: booking.id, actorId: ownerId, idempotencyKey: randomUUID(), requestHash: "fixture", bookingVersion: 1, mode: "AUTO", outcome: "NO_CANDIDATE", factors: {}, reason: "Rever a janela do motorista antes de distribuir novamente." } }); }
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

const metric = (page: Page, label: string) => page.locator("main").getByText(label, { exact: true }).locator("..").locator("dd");
test("operator dashboard connects daily actions, filtered reservations, customers, reports and refresh", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, email); await page.goto(path());
  await expect(page.getByRole("heading", { name: "Sintra Operações", exact: true })).toBeVisible();
  await expect(metric(page, "Reservas ativas")).toHaveText("2"); await expect(metric(page, "Aguardam atribuição")).toHaveText("1");
  await expect(metric(page, "Atribuídas em teste")).toHaveText("1"); await expect(metric(page, "Motoristas com janela")).toHaveText("2");
  await expect(page.getByText("1 reservas com última distribuição sem candidatos", { exact: true })).toBeVisible();
  await expect(page.locator(`.attention-list a[href$="/dispatch/${privateBookingId}"]`)).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true, caret: "initial" });
  await page.getByRole("link", { name: "Abrir reservas para distribuir", exact: true }).click();
  await expect(page.getByLabel("Data de saída")).toHaveValue(date); await expect(page.getByLabel("Estado da reserva")).toHaveValue("CONFIRMED");
  await expect(page.getByRole("article")).toHaveCount(1); await expect(page.getByRole("article")).toContainText("Mariana Teste");
  await page.getByRole("navigation", { name: "Navegação do operador" }).getByRole("link", { name: "Clientes", exact: true }).click();
  await page.getByLabel("Pesquisar nome, e-mail ou telefone").fill("Mariana"); await page.getByRole("button", { name: "Pesquisar clientes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mariana Teste", exact: true })).toBeVisible(); await expect(page.getByRole("heading", { name: "Ricardo Teste", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /Consultar reserva ·/ }).click(); await expect(page.getByRole("article")).toHaveCount(1); await expect(page.getByRole("article")).toContainText("Mariana Teste");
  await page.getByRole("navigation", { name: "Navegação do operador" }).getByRole("link", { name: "Relatórios", exact: true }).click();
  await page.getByLabel("De", { exact: true }).fill(date); await page.getByLabel("Até", { exact: true }).fill(date); await page.getByRole("button", { name: "Ver relatório", exact: true }).click();
  await expect(metric(page, "Reservas ativas")).toHaveText("2"); await expect(metric(page, "Canceladas")).toHaveText("1"); await expect(page.locator(".report-value strong")).toContainText("399,20");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/dashboard-report-mobile.png", fullPage: true, caret: "initial" });
  await page.goto(path()); await db.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
  await page.getByRole("button", { name: "Atualizar dados", exact: true }).click(); await expect(metric(page, "Reservas ativas")).toHaveText("1"); await expect(metric(page, "Aguardam atribuição")).toHaveText("0");
  await page.getByRole("navigation", { name: "Navegação do operador" }).getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(page.getByRole("link", { name: "Configurar agenda", exact: true })).toBeVisible(); expect(errors).toEqual([]);
});

test("viewer sees read-only navigation, invalid filters recover and private pages reject other users", async ({ page, browser }) => {
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_VIEWER" } });
  await login(page, email); await page.goto(path());
  await expect(page.getByText("Modo de leitura. As alterações são feitas pelo responsável ou gestor de operações.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nova reserva de teste", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navegação do operador" }).getByRole("link", { name: "Documentação", exact: true })).toHaveCount(0);
  await page.goto(`/operator/${org}/reports?from=2026-02-30&until=2026-03-01`); await expect(page.locator("main").getByRole("alert")).toContainText("Período inválido");
  await page.goto(`/operator/${org}?date=invalid&page=-1`); await expect(page.locator("main").getByRole("alert")).toContainText("Filtros inválidos");
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(`/operator/${org}/customers`); await expect(other).toHaveURL(/\/login$/); await login(other, outsiderEmail);
  for (const suffix of ["", "/customers", "/reports", "/settings"]) { expect((await other.goto(`/operator/${org}${suffix}`))?.status()).toBe(404); await expect(other.getByText("Mariana Teste", { exact: true })).toHaveCount(0); }
  await context.close();
});

