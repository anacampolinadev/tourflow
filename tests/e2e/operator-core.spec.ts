import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID().replaceAll("-", "");
const ownerEmail = `core-web-${suffix}@example.test`;
const outsiderEmail = `core-outsider-${suffix}@example.test`;
const emails = [ownerEmail, outsiderEmail];
let organizationId = "", ownerId = "";
const orgIds: string[] = [];
async function login(page: Page, email: string) {
  const response = await page.request.get("http://localhost:8025/api/v1/search", { params: { query: `to:${email}` } });
  const messages = z.object({ messages: z.array(z.object({ ID: z.string() })) });
  const previous = new Set(messages.parse(await response.json()).messages.map((message) => message.ID));
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  let id: string | undefined;
  await expect.poll(async () => {
    const response = await page.request.get("http://localhost:8025/api/v1/search", { params: { query: `to:${email}` } });
    id = messages.parse(await response.json()).messages.find((message) => !previous.has(message.ID))?.ID;
    return id;
  }).toBeTruthy();
  const message = await page.request.get(`http://localhost:8025/api/v1/message/${id}`);
  const { Text } = z.object({ Text: z.string() }).parse(await message.json());
  const link = Text.match(/http:\/\/localhost:3100\/api\/auth\/callback\/nodemailer[^\s]+/)?.[0];
  if (!link) throw new Error("Verification email missing.");
  await page.goto(link);
  await expect(page).toHaveURL(/\/workspace$/);
}
async function saved(page: Page) { await expect(page.getByRole("main").getByRole("status")).toHaveText("Cadastro guardado."); }
async function newRecord(page: Page, kind: string, label: string) {
  await page.goto(`/operator/${organizationId}/${kind}`);
  await page.getByRole("link", { name: `Adicionar ${label}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: `Adicionar ${label}`, exact: true })).toBeVisible();
}
test.beforeAll(async () => {
  await db.user.createMany({ data: emails.map((email) => ({ email })) });
  for (const email of emails) {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const organization = await db.organization.create({ data: { name: email === ownerEmail ? "Sintra Operações" : "Outro Operador", slug: `core-web-${user.id}`, members: { create: { userId: user.id, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Responsável Teste", contactEmail: email, contactPhone: "+351 912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "ONBOARDING" } } } });
    orgIds.push(organization.id);
    if (email === ownerEmail) { organizationId = organization.id; ownerId = user.id; }
  }
});
test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  await db.service.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.vehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.driver.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users.map((user) => user.id) } } });
  await db.operatorProfile.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: emails } } });
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.$disconnect();
});

test("owner creates and edits services, vehicles and drivers without publishing", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await login(page, ownerEmail);
  await page.goto(`/operator/${organizationId}`);
  await page.getByRole("link", { name: "Serviços", exact: true }).click();
  await page.getByRole("link", { name: "Adicionar serviço", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Adicionar serviço", exact: true })).toBeVisible();
  await page.getByLabel("Nome do serviço", { exact: true }).fill("Passeio de Sintra");
  await page.getByLabel("Descrição", { exact: true }).fill("Passeio de jipe pela serra de Sintra.");
  await page.getByLabel("Duração em minutos").fill("180");
  await page.getByLabel("Preço base em EUR").fill("49,90");
  await page.getByLabel("Ponto de encontro").fill("Estação de Sintra");
  await page.getByLabel("Permitir recolha de passageiros").check();
  await page.getByLabel("Regras de recolha").fill("Recolha em hotéis de Sintra com confirmação prévia.");
  await page.getByLabel("Inglês", { exact: true }).check();
  await page.getByLabel("Cadastro ativo", { exact: true }).check();
  await page.getByRole("button", { name: "Guardar cadastro", exact: true }).click();
  await saved(page);
  const service = await db.service.findFirstOrThrow({ where: { organizationId, name: "Passeio de Sintra" } });
  const serviceId = service.id;
  expect(service).toMatchObject({ basePriceCents: 4990, durationMinutes: 180, languages: ["pt", "en"], pickupAvailable: true });
  await page.getByLabel("Preço base em EUR").fill("59.95");
  await page.getByLabel("Cadastro ativo", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Guardar cadastro", exact: true }).click();
  await expect.poll(async () => (await db.service.findUniqueOrThrow({ where: { id: serviceId } })).basePriceCents).toBe(5995);
  await expect(page.getByRole("button", { name: "Guardar cadastro", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Voltar à lista" }).click();
  await page.getByLabel("Estado do cadastro").selectOption("active");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Nenhum cadastro encontrado.", { exact: true })).toBeVisible();
  await page.getByLabel("Estado do cadastro").selectOption("inactive");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("link", { name: "Passeio de Sintra", exact: true })).toBeVisible();
  expect((await page.goto(`/operator/${organizationId}/vehicles/${serviceId}`))?.status()).toBe(404);

  await newRecord(page, "vehicles", "veículo");
  await page.getByLabel("Nome do veículo", { exact: true }).fill("Jipe Serra");
  await page.getByLabel("Matrícula", { exact: true }).fill("AA-00-BB");
  await page.getByLabel("Características").fill("Ar condicionado, 4x4");
  await page.getByLabel("Cadastro ativo", { exact: true }).check();
  await page.getByRole("button", { name: "Guardar cadastro", exact: true }).click();
  await saved(page);
  const vehicle = await db.vehicle.findFirstOrThrow({ where: { organizationId, registration: "AA00BB" } });
  const vehicleId = vehicle.id;
  expect(vehicle.registration).toBe("AA00BB");
  await page.getByLabel("Nome do veículo", { exact: true }).fill("Jipe Serra Atualizado");
  await page.getByRole("button", { name: "Guardar cadastro", exact: true }).click();
  await expect.poll(async () => (await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).version).toBe(1);
  await expect(page.getByRole("button", { name: "Guardar cadastro", exact: true })).toBeEnabled();

  await newRecord(page, "drivers", "motorista");
  await page.getByLabel("Nome do motorista", { exact: true }).fill("João Motorista");
  await page.getByLabel("Telefone", { exact: true }).fill("+351 912345678");
  const email = `driver-web-${suffix}@example.test`;
  await page.getByLabel("E-mail do motorista", { exact: true }).fill(email);
  await page.getByLabel("Inglês", { exact: true }).check();
  await page.getByRole("button", { name: "Guardar cadastro", exact: true }).click();
  await saved(page);
  await expect(page.locator("main strong")).toHaveText("Pendente");
  expect(await db.user.findUnique({ where: { email } })).toBeNull();
  await page.getByLabel("Telefone", { exact: true }).fill("+351 987654321");
  await page.getByRole("button", { name: "Guardar cadastro", exact: true }).click();
  await expect.poll(async () => (await db.driver.findFirstOrThrow({ where: { organizationId, email } })).version).toBe(1);
  await expect(page.getByRole("button", { name: "Guardar cadastro", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Telefone", { exact: true })).toHaveValue("+351 987654321");
  for (const [value, label] of [["ACTIVE", "Ativo"], ["SUSPENDED", "Suspenso"], ["PENDING", "Pendente"], ["ACTIVE", "Ativo"]]) {
    await page.getByLabel("Próximo estado").selectOption(value!);
    await page.getByRole("button", { name: "Alterar estado", exact: true }).click();
    await expect(page.locator("main strong")).toHaveText(label!);
  }
  expect((await db.operatorProfile.findUniqueOrThrow({ where: { organizationId } })).status).toBe("ONBOARDING");
  await page.goto(`/operator/${organizationId}/drivers`);
  await expect(page.getByRole("link", { name: "João Motorista", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/operator-core.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/operator-core-mobile.png", fullPage: true, caret: "initial" });
  expect(pageErrors).toEqual([]);
});

test("viewer and dispatcher UI follow current server roles and cross-tenant routes stay private", async ({ page, browser }) => {
  // This scenario can run alone; it does not depend on the preceding browser test.
  const service = await db.service.create({ data: { organizationId, name: "Serviço de leitura", description: "", durationMinutes: 120, pricingType: "PER_GROUP", basePriceCents: 30000, capacity: 6, meetingPoint: "Estação de Sintra", languages: ["pt"] } });
  const vehicle = await db.vehicle.create({ data: { organizationId, name: "Veículo de leitura", type: "VAN", registration: "XX11YY", capacity: 8, features: [] } });
  const serviceId = service.id, vehicleId = vehicle.id;
  await login(page, ownerEmail);
  await db.organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { role: "OPERATOR_VIEWER" } });
  await page.goto(`/operator/${organizationId}/services`);
  await expect(page.getByRole("link", { name: "Adicionar serviço", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Serviço de leitura", exact: true }).click();
  await expect(page.getByLabel("Preço base em EUR")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar cadastro", exact: true })).toHaveCount(0);
  expect((await page.goto(`/operator/${organizationId}/services/new`))?.status()).toBe(404);
  await db.organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { role: "OPERATOR_DISPATCHER" } });
  await page.goto(`/operator/${organizationId}/services/${serviceId}`);
  await expect(page.getByLabel("Preço base em EUR")).toBeDisabled();
  await page.goto(`/operator/${organizationId}/vehicles/${vehicleId}`);
  await expect(page.getByLabel("Nome do veículo", { exact: true })).toBeEnabled();
  await page.getByLabel("Nome do veículo", { exact: true }).fill("Jipe do Dispatcher");
  await page.getByRole("button", { name: "Guardar cadastro", exact: true }).click();
  await saved(page);
  await db.organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { role: "DRIVER" } });
  expect((await page.goto(`/operator/${organizationId}/drivers`))?.status()).toBe(404);
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await login(outsider, outsiderEmail);
  expect((await outsider.goto(`/operator/${organizationId}/vehicles/${vehicleId}`))?.status()).toBe(404);
  await outsiderContext.close();
});
