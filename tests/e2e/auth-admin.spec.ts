import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID().replaceAll("-", "");
const adminEmail = `admin-${suffix}@example.test`;
const ownerEmail = `owner-${suffix}@example.test`;
const outsiderEmail = `outsider-${suffix}@example.test`;
const emails = [adminEmail, ownerEmail, outsiderEmail];
const organizationIds: string[] = [];
const mailpit = "http://localhost:8025";
const messagesSchema = z.object({ messages: z.array(z.object({ ID: z.string() })) });

async function messageIds(page: Page, email: string) {
  const response = await page.request.get(`${mailpit}/api/v1/search`, { params: { query: `to:${email}` } });
  expect(response.ok()).toBe(true);
  return messagesSchema.parse(await response.json()).messages.map((message) => message.ID);
}

async function requestLink(page: Page, email: string): Promise<string> {
  const previous = new Set(await messageIds(page, email));
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  let id: string | undefined;
  await expect.poll(async () => { id = (await messageIds(page, email)).find((value) => !previous.has(value)); return id; }, { timeout: 20_000 }).toBeTruthy();
  const response = await page.request.get(`${mailpit}/api/v1/message/${id}`);
  const { Text } = z.object({ Text: z.string() }).parse(await response.json());
  const link = Text.match(/http:\/\/localhost:3100\/api\/auth\/callback\/nodemailer[^\s]+/)?.[0];
  if (!link) throw new Error("No verification link received by the local test mailbox.");
  return link;
}

async function login(page: Page, email: string) {
  const link = await requestLink(page, email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/workspace$/);
  return link;
}

test.beforeAll(async () => {
  await db.user.createMany({ data: emails.map((email) => ({ email, platformRole: email === adminEmail ? "SUPER_ADMIN" : "USER" })) });
  const outsider = await db.user.findUniqueOrThrow({ where: { email: outsiderEmail } });
  const org = await db.organization.create({ data: { name: `Other organization ${suffix}`, slug: `other-${suffix}`, members: { create: { userId: outsider.id, role: "OPERATOR_VIEWER" } } } });
  organizationIds.push(org.id);
});

test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users.map((user) => user.id) } }, { organizationId: { in: organizationIds } }] } });
  await db.operatorProfile.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [...emails, `unknown-${suffix}@example.test`] } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

test("anonymous access redirects to login and unknown addresses receive no mail", async ({ page }) => {
  await page.goto("/admin/operators");
  await expect(page).toHaveURL(/\/login$/);
  const email = `unknown-${suffix}@example.test`;
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  expect(await messageIds(page, email)).toHaveLength(0);
  expect(await db.user.findUnique({ where: { email } })).toBeNull();
});

test("real email login, operator creation, edit, status, logout and cross-tenant denial", async ({ page, browser }) => {
  const link = await login(page, adminEmail);
  await page.getByRole("link", { name: "Administrar operadores" }).click();
  await page.getByRole("link", { name: "Novo operador" }).click();
  await page.getByLabel("Nome do operador", { exact: true }).fill(`Sintra E2E ${suffix}`);
  await page.getByLabel("Endereço do operador").fill(`sintra-${suffix}`);
  await page.getByLabel("Responsável", { exact: true }).fill("João Teste");
  await page.getByLabel("E-mail de contacto").fill(ownerEmail);
  await page.getByLabel("Telefone", { exact: true }).fill("+351 912345678");
  await page.getByRole("button", { name: "Guardar operador" }).click();
  await expect(page.getByRole("heading", { name: `Sintra E2E ${suffix}`, exact: true })).toBeVisible();
  const org = await db.organization.findUniqueOrThrow({ where: { slug: `sintra-${suffix}` } });
  organizationIds.push(org.id);
  await page.getByLabel("Nome do operador", { exact: true }).fill(`Sintra Atualizada ${suffix}`);
  await page.getByRole("button", { name: "Guardar operador" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações guardadas.");
  await expect(page.getByRole("heading", { name: `Sintra Atualizada ${suffix}`, exact: true })).toBeVisible();
  await page.getByLabel("Próximo estado").selectOption("CONTRACTED");
  await page.getByRole("button", { name: "Alterar estado" }).click();
  await expect(page.getByText("Contratado", { exact: true })).toBeVisible();
  expect((await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org.id } })).status).toBe("CONTRACTED");
  expect(await db.auditLog.count({ where: { organizationId: org.id, action: "operator.status.changed" } })).toBe(1);
  await page.screenshot({ path: "test-results/operator-admin.png", fullPage: true });
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/login\?error=/);

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await login(owner, ownerEmail);
  await owner.getByRole("link", { name: `Sintra Atualizada ${suffix}` }).click();
  await expect(owner.getByRole("heading", { name: `Sintra Atualizada ${suffix}` })).toBeVisible();
  await ownerContext.close();

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await login(outsider, outsiderEmail);
  await expect(outsider.getByText(`Sintra Atualizada ${suffix}`)).toHaveCount(0);
  const response = await outsider.goto(`/operator/${org.id}`);
  expect(response?.status()).toBe(404);
  await outsider.goto(`/admin/operators/${org.id}`);
  await expect(outsider).toHaveURL(/\/workspace$/);
  await outsiderContext.close();
});

test("expired verification link fails and a disabled user loses an existing session", async ({ page }) => {
  const expiredLink = await requestLink(page, adminEmail);
  await db.verificationToken.updateMany({ where: { identifier: adminEmail }, data: { expires: new Date(0) } });
  await page.goto(expiredLink);
  await expect(page).toHaveURL(/\/login\?error=/);
  await login(page, ownerEmail);
  await db.user.update({ where: { email: ownerEmail }, data: { active: false } });
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login$/);
});
