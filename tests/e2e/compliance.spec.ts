import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID().replaceAll("-", "");
const adminEmail = `docs-admin-${suffix}@example.test`;
const ownerEmail = `docs-owner-${suffix}@example.test`;
let organizationId = "";
const orgIds: string[] = [];
const bytes = Buffer.from("%PDF-1.7\nSynthetic document for browser testing\n%%EOF");
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  let id: string | undefined;
  await expect.poll(async () => {
    const response = await page.request.get("http://localhost:8025/api/v1/search", { params: { query: `to:${email}` } });
    id = z.object({ messages: z.array(z.object({ ID: z.string() })) }).parse(await response.json()).messages[0]?.ID;
    return id;
  }).toBeTruthy();
  const response = await page.request.get(`http://localhost:8025/api/v1/message/${id}`);
  const { Text } = z.object({ Text: z.string() }).parse(await response.json());
  const link = Text.match(/http:\/\/localhost:3100\/api\/auth\/callback\/nodemailer[^\s]+/)?.[0];
  if (!link) throw new Error("Verification email missing.");
  await page.goto(link);
  await expect(page).toHaveURL(/\/workspace$/);
}
async function upload(page: Page, fileName: string) {
  await page.getByLabel("Ficheiro para Documento de identificação").setInputFiles({ name: fileName, mimeType: "application/pdf", buffer: bytes });
  await page.getByLabel("Válido até (obrigatório)", { exact: true }).fill("2099-12-31");
  await page.getByRole("button", { name: "Guardar documento", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enviar documentação para análise" })).toBeEnabled();
  await page.getByRole("button", { name: "Enviar documentação para análise" }).click();
  await expect(page.locator("main strong")).toHaveText("Em análise");
}

test.beforeAll(async () => {
  await db.user.createMany({ data: [{ email: adminEmail, platformRole: "SUPER_ADMIN" }, { email: ownerEmail }] });
  const owner = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const organization = await db.organization.create({ data: { name: "Sintra Documentos", slug: `documents-${suffix}`, members: { create: { userId: owner.id, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Responsável Teste", contactEmail: ownerEmail, contactPhone: "+351 912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "ONBOARDING" } } } });
  organizationId = organization.id;
  orgIds.push(organization.id);
  const other = await db.organization.create({ data: { name: "Other tenant", slug: `other-documents-${suffix}`, members: { create: { userId: owner.id, role: "OPERATOR_OWNER" } } } });
  orgIds.push(other.id);
});
test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: [adminEmail, ownerEmail] } }, select: { id: true } });
  await db.complianceReview.deleteMany({ where: { organizationId } });
  await db.complianceDocument.deleteMany({ where: { organizationId } });
  await db.complianceRequirement.deleteMany({ where: { organizationId } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users.map((user) => user.id) } } });
  await db.operatorProfile.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [adminEmail, ownerEmail] } } });
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.$disconnect();
});

test("private uploads, correction, version history and explicit human approval", async ({ page: admin, browser }) => {
  test.setTimeout(120_000);
  await login(admin, adminEmail);
  const adminPath = `/admin/operators/${organizationId}/documents`;
  const ownerPath = `/operator/${organizationId}/documents`;
  await admin.goto(adminPath);
  await admin.getByLabel("Nome do documento exigido").fill("Documento de identificação");
  await admin.getByLabel("Exigir data de validade").check();
  await admin.getByRole("button", { name: "Adicionar requisito" }).click();
  await expect(admin.getByRole("heading", { name: "Documento de identificação", exact: true })).toBeVisible();
  await expect(admin.locator("main strong")).toHaveText("Documentos pendentes");

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await login(owner, ownerEmail);
  await owner.goto(ownerPath);
  await expect(owner.getByRole("button", { name: "Enviar documentação para análise" })).toBeDisabled();
  await upload(owner, "primeiro.pdf");
  await admin.reload();
  await expect(admin.getByRole("button", { name: "Aprovar documentação do operador" })).toBeDisabled();
  await admin.getByLabel("Decisão para Documento de identificação").selectOption("REJECTED");
  await admin.getByLabel("Motivo da substituição").fill("Envie uma cópia legível do documento.");
  await admin.getByRole("button", { name: "Guardar revisão" }).click();
  await expect(admin.locator("main strong")).toHaveText("Documentos pendentes");
  await owner.reload();
  await expect(owner.getByRole("main").getByRole("alert")).toContainText("cópia legível");
  await expect(owner.getByRole("button", { name: "Enviar documentação para análise" })).toBeDisabled();
  await upload(owner, "substituto.pdf");
  await owner.getByText("Histórico de versões (2)", { exact: true }).click();
  await expect(owner.getByRole("link", { name: /Descarregar versão 1/ })).toBeVisible();
  const attachment = owner.waitForEvent("download");
  await owner.getByRole("link", { name: /Descarregar versão 2/ }).click();
  expect((await attachment).suggestedFilename()).toBe("documento.pdf");
  const storedDocument = await db.complianceDocument.findFirstOrThrow({ where: { organizationId }, orderBy: { revision: "desc" } });
  const downloadUrl = `/api/organizations/${organizationId}/documents/${storedDocument.id}`;
  const downloaded = await owner.request.get(downloadUrl);
  expect(downloaded.status()).toBe(200);
  expect(downloaded.headers()["content-disposition"]).toBe('attachment; filename="documento.pdf"');
  expect(downloaded.headers()["cache-control"]).toContain("no-store");
  expect(await downloaded.body()).toEqual(bytes);
  expect((await owner.request.get(`${downloadUrl}?scope=admin`)).status()).toBe(404);
  expect((await owner.request.get(`/api/organizations/${orgIds[1]}/documents/${storedDocument.id}`)).status()).toBe(404);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`http://localhost:3100${downloadUrl}`)).status()).toBe(404);
  await anonymous.close();

  await admin.reload();
  await admin.getByRole("button", { name: "Guardar revisão" }).click();
  await expect(admin.getByRole("button", { name: "Aprovar documentação do operador" })).toBeEnabled();
  await admin.getByRole("button", { name: "Aprovar documentação do operador" }).click();
  await expect(admin.locator("main strong")).toHaveText("Aprovado");
  await expect(admin.getByRole("main").getByRole("status")).toContainText("Documentação aprovada e válida");
  const profile = await db.operatorProfile.findUniqueOrThrow({ where: { organizationId } });
  expect(profile.approvedAt).not.toBeNull();
  expect(profile.approvedById).not.toBeNull();
  expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(admin.viewportSize()?.width ?? 1280);
  await admin.screenshot({ path: "test-results/compliance-approved.png", fullPage: true });
  await ownerContext.close();
});
