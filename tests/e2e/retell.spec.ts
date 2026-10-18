import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `retell-ui-${suffix}@example.test`, adminEmail = `retell-ui-admin-${suffix}@example.test`, outsiderEmail = `retell-ui-out-${suffix}@example.test`;
let org = "", ownerId = "";
async function login(page: Page, address: string) {
  const schema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
  const search = async () => schema.parse(await (await page.request.get("http://localhost:8025/api/v1/search", { params: { query: `to:${address}` } })).json()).messages;
  const before = new Set((await search()).map(message => message.ID));
  await page.goto("/login"); await page.getByLabel("E-mail", { exact: true }).fill(address); await page.getByRole("button", { name: "Receber link de acesso" }).click(); await expect(page).toHaveURL(/\/login\/check-email/);
  let id: string | undefined; await expect.poll(async () => { id = (await search()).find(message => !before.has(message.ID))?.ID; return id; }).toBeTruthy();
  const { Text } = z.object({ Text: z.string() }).parse(await (await page.request.get(`http://localhost:8025/api/v1/message/${id}`)).json());
  const link = Text.match(/http:\/\/localhost:3100\/api\/auth\/callback\/nodemailer[^\s]+/)?.[0]; if (!link) throw new Error("Verification email missing."); await page.goto(link); await expect(page).toHaveURL(/\/workspace$/);
}
test.beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required");
  await db.user.createMany({ data: [{ email }, { email: adminEmail, platformRole: "SUPER_ADMIN" }, { email: outsiderEmail }] });
  ownerId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  org = (await db.organization.create({ data: { name: "Sintra · Preparação do piloto", slug: `retell-ui-${suffix}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900 } } } })).id;
});
test.afterAll(async () => {
  const where = { organizationId: org }; await db.retellEvent.deleteMany({ where }); await db.retellConnection.deleteMany({ where }); await db.auditLog.deleteMany({ where });
  await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: org } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, adminEmail, outsiderEmail] } } }); await db.user.deleteMany({ where: { email: { in: [email, adminEmail, outsiderEmail] } } }); await db.$disconnect();
});
test("administrator prepares Retell without secrets and missing credentials remain blocked for the owner", async ({ page, browser }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, adminEmail); await page.goto(`/admin/operators/${org}/integrations`);
  await expect(page.getByRole("heading", { name: "Ligação de telefonia", exact: true })).toBeVisible();
  await page.getByLabel("Identificador do agente Retell", { exact: true }).fill(`agent_${suffix}`);
  await page.getByLabel("Aceitar eventos de teste após verificação", { exact: true }).check(); await page.getByRole("button", { name: "Guardar ligação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Verificar ligação à API", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verificar ligação à API", exact: true }).click();
  await expect(page.getByRole("region", { name: "Estado da ligação", exact: true })).toContainText("Último resultado: Credencial, URL pública ou ativação em falta no servidor");
  await page.screenshot({ path: "test-results/retell-admin.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  const ownerPage = await browser.newPage({ baseURL: "http://localhost:3100" }); ownerPage.on("pageerror", error => errors.push(error.message));
  await login(ownerPage, email); await ownerPage.goto(`/operator/${org}/integrations`);
  await expect(ownerPage.getByRole("region", { name: "Estado da ligação", exact: true })).toContainText("Ligação bloqueada");
  await expect(ownerPage.getByRole("button", { name: "Guardar ligação", exact: true })).toHaveCount(0); await expect(ownerPage.getByRole("main")).toContainText("Ainda não foi recebido um evento autenticado");
  await ownerPage.screenshot({ path: "test-results/retell-operator.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await ownerPage.setViewportSize({ width: 390, height: 844 }); expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await ownerPage.screenshot({ path: "test-results/retell-mobile.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  expect((await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).status).toBe("LEAD");
  const connection = await db.retellConnection.findUniqueOrThrow({ where: { organizationId: org } }); expect(connection).toMatchObject({ checkResult: "MISSING_CONFIG", credentialHash: null, lastEventAt: null });
  expect(await db.retellEvent.count({ where: { organizationId: org } })).toBe(0);
  const deniedIngress = await page.request.post("/api/webhooks/retell", { data: { event: "call_ended", call: { agent_id: `agent_${suffix}`, call_id: "forged" } } }); expect(deniedIngress.status()).toBe(503);
  expect(await deniedIngress.text()).toBe(""); await ownerPage.close(); expect(errors).toEqual([]);
});
test("foreign accounts cannot read operator integration data or access administrative settings", async ({ page }) => {
  await login(page, outsiderEmail);
  const response = await page.request.get(`/operator/${org}/integrations`); expect(response.status()).toBe(404); expect(await response.text()).not.toContain("Eventos recentes");
  const admin = await page.request.get(`/admin/operators/${org}/integrations`); expect(admin.url()).toContain("/workspace"); expect(await admin.text()).not.toContain("Preparar agente de teste");
});
