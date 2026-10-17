import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `assistant-ui-${suffix}@example.test`, viewerEmail = `assistant-viewer-${suffix}@example.test`;
const orgs: string[] = []; let org = "", other = "", ownerId = "", viewerId = "";
async function login(page: Page, email: string) {
  const schema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
  const search = async () => schema.parse(await (await page.request.get("http://localhost:8025/api/v1/search", { params: { query: `to:${email}` } })).json()).messages;
  const before = new Set((await search()).map(message => message.ID));
  await page.goto("/login"); await page.getByLabel("E-mail", { exact: true }).fill(email); await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  let id: string | undefined;
  await expect.poll(async () => { id = (await search()).find(message => !before.has(message.ID))?.ID; return id; }).toBeTruthy();
  const { Text } = z.object({ Text: z.string() }).parse(await (await page.request.get(`http://localhost:8025/api/v1/message/${id}`)).json());
  const link = Text.match(/http:\/\/localhost:3100\/api\/auth\/callback\/nodemailer[^\s]+/)?.[0];
  if (!link) throw new Error("Verification email missing.");
  await page.goto(link); await expect(page).toHaveURL(/\/workspace$/);
}
test.beforeAll(async () => {
  await db.user.createMany({ data: [{ email }, { email: viewerEmail }] });
  ownerId = (await db.user.findUniqueOrThrow({ where: { email } })).id; viewerId = (await db.user.findUniqueOrThrow({ where: { email: viewerEmail } })).id;
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: index ? "Costa Teste" : "Serra Teste", slug: `assistant-ui-${suffix}-${index}`, members: { create: [{ userId: ownerId, role: "OPERATOR_OWNER" }, ...(!index ? [{ userId: viewerId, role: "OPERATOR_VIEWER" as const }] : [])] }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } }); orgs.push(row.id);
    await db.complianceRequirement.create({ data: { organizationId: row.id, title: "Approved fixture", documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "fixture", data: Buffer.from("%PDF-"), uploadedById: ownerId, status: "APPROVED" } } } });
  }
  org = orgs[0]!; other = orgs[1]!;
});
test.afterAll(async () => {
  const where = { organizationId: { in: orgs } };
  await db.assistantVersion.deleteMany({ where }); await db.assistantProfile.deleteMany({ where });
  await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, viewerEmail] } } }); await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } }); await db.$disconnect();
});
test("owner prepares, edits, corrects an invalid draft and reads immutable versions on desktop/mobile", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, email); await page.goto(`/operator/${org}/assistant`);
  await page.getByRole("button", { name: "Preparar assistente de teste", exact: true }).click();
  const save = page.getByRole("button", { name: "Guardar configuração da assistente", exact: true }); await expect(save).toBeVisible();
  await page.getByLabel("Nome da assistente", { exact: true }).fill("Sofia <Serra>");
  await page.getByLabel("Políticas de atendimento (até 4000 caracteres)").fill("Consulte o responsável para pedidos especiais.");
  await page.getByLabel("Responsável pelo atendimento humano", { exact: true }).fill("Equipa interna");
  await save.click(); await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Nome da assistente", { exact: true })).toHaveValue("Sofia <Serra>");
  await page.getByLabel("E-mail interno para encaminhamento", { exact: true }).fill("private-routing@example.test");
  await save.click(); await expect.poll(async () => (await db.assistantProfile.findUniqueOrThrow({ where: { organizationId: org } })).version).toBe(2);
  await expect(page.getByRole("heading", { name: "Configuração atual · versão 2", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Nome da assistente", { exact: true })).toHaveValue("Sofia <Serra>");
  await page.getByText("Pré-visualizar instruções guardadas", { exact: true }).click();
  await expect(page.locator(".assistant-instructions")).toContainText('"assistantName":"Sofia <Serra>"');
  await expect(page.locator(".assistant-instructions")).not.toContainText("private-routing@example.test");
  await page.screenshot({ path: "test-results/assistant-desktop.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/assistant-mobile.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.getByRole("link", { name: "Versão 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Consultar versão anterior · versão 1", exact: true })).toBeVisible();
  await expect(page.getByLabel("Nome da assistente", { exact: true })).toHaveValue("Alana"); await expect(save).toHaveCount(0);
  await page.goto(`/operator/${other}/assistant`); await expect(page.getByRole("button", { name: "Preparar assistente de teste", exact: true })).toBeVisible();
  expect(await db.assistantProfile.count({ where: { organizationId: other } })).toBe(0);
  expect(errors).toEqual([]);
});
test("viewer cannot open private assistant configuration and unauthorized version queries expose no content", async ({ page, browser }) => {
  await login(page, viewerEmail); await page.goto(`/operator/${org}/settings`);
  await expect(page.getByRole("link", { name: "Configurar assistente Alana", exact: true })).toHaveCount(0);
  for (const id of [org, other]) {
    const response = await page.request.get(`/operator/${id}/assistant?version=1`); expect(response.status()).toBe(404); expect(await response.text()).not.toContain("private-routing@example.test");
  }
  const anonymous = await browser.newContext();
  const response = await anonymous.request.get(`/operator/${org}/assistant`); expect(response.url()).toContain("/login"); await anonymous.close();
});
