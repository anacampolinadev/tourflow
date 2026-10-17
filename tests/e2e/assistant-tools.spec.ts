import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `tools-ui-${suffix}@example.test`, outsiderEmail = `tools-ui-out-${suffix}@example.test`;
const orgs: string[] = [];
let org = "", ownerId = "", serviceId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const path = () => `/operator/${org}/assistant/tools`;
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
  const row = await db.organization.create({ data: { name: "Sintra Reservas", slug: `tools-ui-${suffix}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, primaryLanguage: "pt", status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } });
  org = row.id; orgs.push(org);
  await db.assistantProfile.create({ data: { organizationId: org, versions: { create: { version: 1, configuration: { operatorName: "Serra Tools", assistantName: "Alana", tone: "WARM", languages: ["pt", "en"], openingHours: "", policies: "", faqs: "", escalationName: "", escalationEmail: "", escalationPhone: "" }, instructions: "Fixture for tool tests only", playbookVersion: "alana-tools-1" } } } });
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
  await db.assistantToolCall.deleteMany({ where }); await db.assistantHandoff.deleteMany({ where }); await db.assistantConversation.deleteMany({ where });
  await db.assistantVersion.deleteMany({ where }); await db.assistantProfile.deleteMany({ where });
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, outsiderEmail] } } }); await db.user.deleteMany({ where: { email: { in: [email, outsiderEmail] } } }); await db.$disconnect();
});

test("real tool session reads catalog, checks availability, books atomically and registers human request", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, email); await page.goto(path()); await page.getByRole("button", { name: "Iniciar nova sessão de teste", exact: true }).click();
  await expect(page).toHaveURL(/session=/);
  await expect(page.getByRole("region", { name: "Catálogo de serviços", exact: true })).toContainText("Tour da Serra");
  const details = page.getByRole("region", { name: "Detalhes do serviço", exact: true });
  await details.getByRole("button", { name: "Consultar serviço", exact: true }).click(); await expect(details.getByRole("status")).toHaveText("Detalhes atuais consultados."); await expect(details).toContainText("Estação de Sintra");
  const availability = page.getByRole("region", { name: "Consulta de disponibilidade", exact: true });
  await availability.getByLabel("Data", { exact: true }).fill(date); await availability.getByLabel("Passageiros", { exact: true }).fill("4");
  await availability.getByRole("button", { name: "Verificar recursos de teste", exact: true }).click(); await expect(availability.getByRole("status")).toContainText("Há recursos livres");
  expect(await db.booking.count({ where: { organizationId: org } })).toBe(0);
  const booking = page.getByRole("region", { name: "Criação de reserva", exact: true });
  await booking.getByLabel("Data", { exact: true }).fill(date); await booking.getByLabel("Passageiros", { exact: true }).fill("4");
  await booking.getByLabel("Nome do cliente", { exact: true }).fill("Cliente de Teste"); await booking.getByLabel("E-mail do cliente", { exact: true }).fill("private-customer@example.test"); await booking.getByLabel("Telefone do cliente", { exact: true }).fill("+351912345678");
  await booking.getByRole("button", { name: "Criar reserva pela Alana", exact: true }).click(); await expect(booking.getByRole("status")).toHaveText("Reserva criada em teste.");
  await expect(booking).toContainText("199,60");
  const row = await db.booking.findFirstOrThrow({ where: { organizationId: org } });
  await booking.getByRole("button", { name: "Criar reserva pela Alana", exact: true }).click(); await expect(booking.getByRole("status")).toHaveText("Pedido já registado; estado atual consultado.");
  expect(await db.booking.count({ where: { organizationId: org } })).toBe(1);
  const lookup = page.getByRole("region", { name: "Consulta de reserva", exact: true });
  await lookup.getByLabel("Referência da reserva", { exact: true }).fill(row.id); await lookup.getByRole("button", { name: "Consultar estado da reserva", exact: true }).click(); await expect(lookup.getByRole("status")).toHaveText("Estado atual da reserva consultado.");
  await availability.getByRole("button", { name: "Verificar recursos de teste", exact: true }).click(); await expect(availability.getByRole("status")).toContainText("Sem veículo");
  const handoff = page.getByRole("region", { name: "Pedido de atendimento humano", exact: true });
  await handoff.getByLabel("Motivo do pedido", { exact: true }).fill("Cliente pede ajuda humana sobre condições especiais."); await handoff.getByRole("button", { name: "Registar pedido de atendimento", exact: true }).click();
  await expect(handoff.getByRole("status")).toContainText("Nenhuma mensagem foi enviada");
  await page.screenshot({ path: "test-results/alana-tools-desktop.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/alana-tools-mobile.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.reload(); await expect(page.getByRole("region", { name: "Fila de atendimento", exact: true })).toContainText("Cliente pede ajuda humana");
  expect(await db.assistantHandoff.count({ where: { organizationId: org } })).toBe(1); expect(errors).toEqual([]);
});

test("foreign account cannot access session or human queue", async ({ page }) => {
  await login(page, outsiderEmail);
  const response = await page.request.get(path()); expect(response.status()).toBe(404); expect(await response.text()).not.toContain("Cliente pede ajuda humana");
});
