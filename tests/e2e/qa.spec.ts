import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { composeAssistantInstructions } from "../../src/modules/assistants/domain";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `qa-ui-${suffix}@example.test`, outsiderEmail = `qa-ui-out-${suffix}@example.test`;
const adminEmail = `qa-ui-admin-${suffix}@example.test`;
let driverUser = "";
const orgs: string[] = [];
let org = "", ownerId = "", serviceId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const path = () => `/operator/${org}/qa`;
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
  await db.user.createMany({ data: [{ email }, { email: outsiderEmail }, { email: adminEmail, platformRole: "SUPER_ADMIN" }] });
  ownerId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  const row = await db.organization.create({ data: { name: "Sintra Reservas", slug: `qa-ui-${suffix}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, primaryLanguage: "pt", status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } });
  org = row.id; orgs.push(org);
  const ready = { operatorName: "Serra QA", assistantName: "Alana", tone: "WARM" as const, languages: ["pt" as const], openingHours: "09:00–18:00", policies: "Condições do operador para testes", faqs: "Contacte a equipa para dúvidas", escalationName: "Equipa", escalationEmail: "qa-routing@example.test", escalationPhone: "" };
  await db.assistantProfile.create({ data: { organizationId: org, versions: { create: { version: 1, configuration: ready, instructions: composeAssistantInstructions(ready), playbookVersion: "alana-tools-1" } } } });
  await db.complianceRequirement.create({ data: { organizationId: org, title: "Approved fixture", requiresExpiry: false, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: ownerId, status: "APPROVED" } } } });
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Tour da Serra", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Estação de Sintra", languages: ["pt", "en"], active: true } })).id;
  const vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Jipe", type: "JEEP", registration: "BKUI01", capacity: 6, features: [], active: true } })).id;
  const driverId = (await db.driver.create({ data: { organizationId: org, name: "Motorista", email: `driver-ui-${suffix}@example.test`, phone: "+351912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
  driverUser = (await db.user.create({ data: { email: `qa-driver-ui-${suffix}@example.test` } })).id;
  await db.organizationMember.create({ data: { organizationId: org, userId: driverUser, role: "DRIVER" } });
  await db.driver.update({ where: { id: driverId }, data: { userId: driverUser } });
  const icon = (size: number) => sharp({ create: { width: size, height: size, channels: 3, background: "#124e66" } }).png().toBuffer();
  await db.brandProfile.create({ data: { organizationId: org, displayName: "Serra QA", primaryColor: "#124e66", secondaryColor: "#e0edf3", icon192: await icon(192), icon512: await icon(512) } });
  await db.serviceVehicle.create({ data: { organizationId: org, serviceId, vehicleId } });
  await db.serviceSchedule.create({ data: { organizationId: org, serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, departureMinutes: 600, validFrom: new Date(`${date}T00:00Z`), validUntil: new Date(`${date}T00:00Z`), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } });
  await db.driverAvailability.create({ data: { organizationId: org, driverId, startsAt: new Date(`${date}T00:00Z`), endsAt: new Date(`${date}T23:59Z`) } });
});
test.afterAll(async () => {
  const where = { organizationId: { in: orgs } };
  await db.qaManualCheck.deleteMany({ where }); await db.qaRun.deleteMany({ where }); await db.brandProfile.deleteMany({ where });
  await db.assistantToolCall.deleteMany({ where }); await db.assistantHandoff.deleteMany({ where }); await db.assistantConversation.deleteMany({ where });
  await db.assistantVersion.deleteMany({ where }); await db.assistantProfile.deleteMany({ where });
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, outsiderEmail, adminEmail] } } }); await db.user.deleteMany({ where: { OR: [{ email: { in: [email, outsiderEmail, adminEmail] } }, { id: driverUser }] } }); await db.$disconnect();
});

test("owner runs rollback-only QA, admin records a blocked conversation and changed configuration invalidates report", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, email); await page.goto(path()); await page.getByRole("button", { name: "Executar bateria de QA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "33/33 verificações internas passaram", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Verificações de qualidade", exact: true })).toContainText("Conversas reais da assistente por avaliar");
  await expect(page.getByRole("main")).toContainText("Produção bloqueada");
  for (const total of await Promise.all([db.booking.count({ where: { organizationId: org } }), db.customer.count({ where: { organizationId: org } }), db.assistantConversation.count({ where: { organizationId: org } }), db.assistantHandoff.count({ where: { organizationId: org } })])) expect(total).toBe(0);
  const run = await db.qaRun.findFirstOrThrow({ where: { organizationId: org } });
  await page.getByRole("link", { name: "Mostrar todas as verificações", exact: true }).click(); await expect(page.locator(".qa-checks > li")).toHaveCount(34);
  await page.getByRole("link", { name: "Mostrar só falhas e pendências", exact: true }).click();
  await page.screenshot({ path: "test-results/qa-operator.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/qa-mobile.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  const admin = await browser.newPage({ baseURL: "http://localhost:3100" }); admin.on("pageerror", error => errors.push(error.message));
  await login(admin, adminEmail); await admin.goto(`/admin/operators/${org}/qa?run=${run.id}`);
  const scenario = admin.getByRole("article").filter({ has: admin.getByRole("heading", { name: "Conversa de reserva normal", exact: true }) });
  await scenario.getByLabel("Evidência ou impedimento (20–1000 caracteres, sem dados de turistas)", { exact: true }).fill("A aplicação ainda não integra conversas reais para avaliar este cenário.");
  await scenario.getByRole("button", { name: "Guardar revisão humana", exact: true }).click(); await expect(scenario).toContainText("Impedimento registado · revisão 1");
  await admin.screenshot({ path: "test-results/qa-admin.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.reload(); await expect(page.getByRole("region", { name: "Revisão humana", exact: true })).toContainText("Impedimento registado · revisão 1");
  await db.service.update({ where: { id: serviceId }, data: { version: { increment: 1 } } }); await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Relatório desatualizado");
  expect((await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).status).toBe("SANDBOX");
  await admin.close(); expect(errors).toEqual([]);
});

test("foreign account cannot read quality evidence or use admin review", async ({ page }) => {
  await login(page, outsiderEmail); const response = await page.request.get(path()); expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("Integração de conversação");
  const adminResponse = await page.request.get(`/admin/operators/${org}/qa`); expect(adminResponse.url()).toContain("/workspace"); expect(await adminResponse.text()).not.toContain("Revisão de qualidade");
});
