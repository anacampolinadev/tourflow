import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID(), email = `brand-ui-${suffix}@example.test`, driverEmail = `brand-ui-driver-${suffix}@example.test`, viewerEmail = `brand-ui-viewer-${suffix}@example.test`;
const orgs: string[] = []; let org = "", other = "", ownerId = "", driverUser = "", viewerUser = "";
const path = () => `/operator/${org}/brand`;
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


async function fixtureBrand(organizationId: string, displayName: string, primaryColor: string, secondaryColor: string) {
  const icon = (size: number) => sharp({ create: { width: size, height: size, channels: 3, background: primaryColor } }).png().toBuffer();
  await db.brandProfile.create({ data: { organizationId, displayName, primaryColor, secondaryColor, icon192: await icon(192), icon512: await icon(512) } });
}
test.beforeAll(async () => {
  await db.user.createMany({ data: [{ email }, { email: driverEmail }, { email: viewerEmail }] });
  ownerId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  driverUser = (await db.user.findUniqueOrThrow({ where: { email: driverEmail } })).id;
  viewerUser = (await db.user.findUniqueOrThrow({ where: { email: viewerEmail } })).id;
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: index ? "Costa Comércio" : "Serra Comércio", slug: `brand-ui-${suffix}-${index}`, members: { create: [{ userId: ownerId, role: "OPERATOR_OWNER" }, { userId: driverUser, role: "DRIVER" }, ...(!index ? [{ userId: viewerUser, role: "OPERATOR_VIEWER" as const }] : [])] }, operator: { create: { responsibleName: "Test", contactEmail: email, contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: ownerId } } } });
    orgs.push(row.id);
    await db.complianceRequirement.create({ data: { organizationId: row.id, title: "Approved fixture", documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "fixture", data: Buffer.from("%PDF-"), uploadedById: ownerId, status: "APPROVED" } } } });
    await db.driver.create({ data: { organizationId: row.id, userId: driverUser, name: "João da Serra", email: driverEmail, phone: "+351912345678", languages: ["pt"], status: "ACTIVE" } });
  }
  org = orgs[0]!; other = orgs[1]!;
});
test.beforeEach(async () => {
  await db.brandProfile.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: viewerUser }, data: { active: true } });
});
test.afterAll(async () => {
  const where = { organizationId: { in: orgs } };
  await db.brandProfile.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: [email, driverEmail, viewerEmail] } } }); await db.user.deleteMany({ where: { id: { in: [ownerId, driverUser, viewerUser] } } }); await db.$disconnect();
});

test("owner generates, edits and uploads the brand; the saved identity survives refresh without changing organization", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await login(page, email); await page.goto(path());
  await page.getByRole("button", { name: "Gerar white-label de teste", exact: true }).click();
  await expect(page.getByRole("button", { name: "Guardar identidade", exact: true })).toBeVisible();
  await page.getByLabel("Nome de apresentação", { exact: true }).fill("Serra <Premium>");
  await page.getByLabel("Cor principal", { exact: true }).fill("#773399"); await page.getByLabel("Cor secundária", { exact: true }).fill("#ffeecc");
  const logo = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#772299" } }).png().toBuffer();
  await page.getByLabel("Logótipo PNG (opcional)").setInputFiles({ name: "brand.png", mimeType: "image/png", buffer: logo });
  await page.getByRole("button", { name: "Guardar identidade", exact: true }).click();
  await expect.poll(async () => (await db.brandProfile.findUniqueOrThrow({ where: { organizationId: org } })).version).toBe(1);
  await expect(page.locator("header .brand-mark")).toHaveText("Serra <Premium>");
  await expect(page.getByRole("img", { name: "Logótipo de Serra <Premium>", exact: true }).first()).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Nome de apresentação", { exact: true })).toHaveValue("Serra <Premium>");
  await expect(page).toHaveTitle("Serra <Premium>");
  expect(await page.locator(".operator-shell").evaluate(element => getComputedStyle(element).getPropertyValue("--brand-primary").trim())).toBe("#773399");
  expect((await db.organization.findUniqueOrThrow({ where: { id: org } })).name).toBe("Serra Comércio");
  const response = await page.request.get(`/api/organizations/${org}/brand/logo`); expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await sharp(await response.body()).metadata()).toMatchObject({ format: "png", width: 96, height: 64 });
  await page.screenshot({ path: "test-results/branding-operator.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/branding-operator-mobile.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  expect(errors).toEqual([]);
});

test("driver sees each organization's own theme and Chromium fetches the private manifest with credentials", async ({ page, context }) => {
  test.setTimeout(120_000);
  await fixtureBrand(org, "Serra Laranja", "#953d00", "#fff3df"); await fixtureBrand(other, "Costa Azul", "#164ca4", "#ddecff");
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await login(page, driverEmail); await page.goto(`/driver/${org}`);
  await expect(page.locator("header .brand-mark")).toHaveText("Serra Laranja"); await expect(page).toHaveTitle("Motorista · Serra Laranja");
  const manifestLink = page.locator('link[rel="manifest"]'); await expect(manifestLink).toHaveCount(1); await expect(manifestLink).toHaveAttribute("crossorigin", "use-credentials");
  const cdp = await context.newCDPSession(page); const appManifest = await cdp.send("Page.getAppManifest");
  expect(appManifest.errors).toEqual([]); expect(JSON.parse(appManifest.data ?? "{}")).toMatchObject({ name: "Serra Laranja — Motorista", start_url: `/driver/${org}`, theme_color: "#953d00" });
  const asset = await page.request.get(`/api/organizations/${org}/brand/icon512`); expect(asset.status()).toBe(200); expect(await sharp(await asset.body()).metadata()).toMatchObject({ width: 512, height: 512 });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/branding-driver-mobile.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  await page.getByRole("link", { name: "O seu espaço", exact: true }).click(); await page.getByRole("link", { name: "Costa Comércio — motorista", exact: true }).click();
  await expect(page.locator("header .brand-mark")).toHaveText("Costa Azul"); await expect(page.getByText("Serra Laranja", { exact: true })).toHaveCount(0);
  await expect(page).toHaveTitle("Motorista · Costa Azul");
  expect(await page.locator(".brand-themed").evaluate(element => getComputedStyle(element).getPropertyValue("--brand-primary").trim())).toBe("#164ca4");
  await page.screenshot({ path: "test-results/branding-other-driver.png", fullPage: true, caret: "initial", style: "nextjs-portal { visibility: hidden; }" });
  expect(errors).toEqual([]);
});

test("viewer cannot edit and foreign, revoked or anonymous requests cannot fetch private brand files", async ({ page, browser }) => {
  await fixtureBrand(org, "Private Serra", "#224477", "#eef2ff"); await fixtureBrand(other, "Private Coast", "#113355", "#eeeeff");
  await login(page, viewerEmail); await page.goto(path());
  await expect(page.getByText("Modo de leitura. Apenas o responsável altera a identidade.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar identidade", exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/organizations/${other}/brand/icon192`)).status()).toBe(404);
  expect((await page.request.get(`/driver/${other}/manifest.webmanifest`)).status()).toBe(404);
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: viewerUser }, data: { active: false } });
  expect((await page.request.get(`/api/organizations/${org}/brand/icon192`)).status()).toBe(404);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`/api/organizations/${org}/brand/icon192`)).status()).toBe(404);
  expect((await anonymous.request.get(`/driver/${org}/manifest.webmanifest`)).status()).toBe(404); await anonymous.close();
});
