import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const suffix = randomUUID().replaceAll("-", ""), ownerEmail = `agenda-${suffix}@example.test`, outsiderEmail = `agenda-other-${suffix}@example.test`;
const emails = [ownerEmail, outsiderEmail], orgs: string[] = [];
let org = "", ownerId = "", serviceId = "", vehicleId = "", driverId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 10 }).toString();
const path = () => `/operator/${org}/calendar?date=${date}`;
const version = async () => (await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).calendarVersion;
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
async function open(page: Page, summary: string, button: string) {
  if (!await page.getByRole("button", { name: button, exact: true }).isVisible()) await page.getByText(summary, { exact: true }).click();
  await expect(page.getByRole("button", { name: button, exact: true })).toBeVisible();
}
async function save(page: Page, label: string) {
  const before = await version(); await page.getByRole("button", { name: label, exact: true }).click();
  await expect.poll(version).toBe(before + 1);
  await expect(page.getByRole("button", { name: label, exact: true })).toBeEnabled();
}
async function query(page: Page, time = "10:00") {
  await page.getByLabel("Serviço", { exact: true }).selectOption(serviceId);
  await page.getByLabel("Data da consulta").fill(date); await page.getByLabel("Hora de saída", { exact: true }).fill(time);
  await page.getByLabel("Passageiros", { exact: true }).fill("4"); await page.getByLabel("Idioma pedido").selectOption("en");
  await page.getByRole("button", { name: "Consultar agenda", exact: true }).click();
  await expect(page.locator(".calendar-result")).toBeVisible();
}
test.beforeAll(async () => {
  await db.user.createMany({ data: emails.map((email) => ({ email })) });
  for (const email of emails) {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const row = await db.organization.create({ data: { name: email === ownerEmail ? "Sintra Agenda" : "Outro Operador Agenda", slug: `agenda-${user.id}`, members: { create: { userId: user.id, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test owner", contactEmail: email, contactPhone: "+351 912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "ONBOARDING" } } } });
    orgs.push(row.id); if (email === ownerEmail) { org = row.id; ownerId = user.id; }
  }
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Tour da Serra", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Sintra", languages: ["pt", "en"], active: true } })).id;
  vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Jipe da Serra", registration: "AGENDA01", type: "JEEP", capacity: 6, features: [], active: true } })).id;
  driverId = (await db.driver.create({ data: { organizationId: org, name: "João da Agenda", email: `agenda-driver-${suffix}@example.test`, phone: "+351 912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
});
test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } }), where = { organizationId: { in: orgs } };
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.auditLog.deleteMany({ where: { actorId: { in: users.map((user) => user.id) } } });
  await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.verificationToken.deleteMany({ where: { identifier: { in: emails } } }); await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } }); await db.$disconnect();
});

test("owner builds the agenda, checks real free resources and resolves a blocked departure", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await login(page, ownerEmail); await page.goto(`/operator/${org}`); await page.getByRole("link", { name: "Agenda e disponibilidade", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agenda e disponibilidade", exact: true })).toBeVisible();
  await page.goto(path()); await query(page);
  await expect(page.locator(".calendar-result").getByRole("alert")).toHaveText("Não existe saída prevista para esse horário.");
  for (const time of ["10:00", "14:00"]) {
    await open(page, "Adicionar saída semanal", "Guardar saída");
    await page.getByLabel("Serviço da saída", { exact: true }).selectOption(serviceId);
    await page.getByLabel("Dia da semana", { exact: true }).selectOption(String(Temporal.PlainDate.from(date).dayOfWeek));
    await page.getByLabel("Hora da saída semanal").fill(time); await page.getByLabel("Válida desde", { exact: true }).fill(date);
    await page.getByLabel("Pausa antes (minutos)").fill("15"); await page.getByLabel("Pausa depois (minutos)").fill("15");
    await save(page, "Guardar saída");
  }
  await open(page, "Associar veículo ao serviço", "Guardar associação");
  await page.getByLabel("Serviço da associação").selectOption(serviceId); await page.getByLabel("Veículo da associação").selectOption(vehicleId); await save(page, "Guardar associação");
  await open(page, "Adicionar janela do motorista", "Guardar janela");
  await page.getByLabel("Motorista da janela").selectOption(driverId);
  const windowForm = page.getByRole("button", { name: "Guardar janela", exact: true }).locator("..");
  await windowForm.getByLabel("Início", { exact: true }).fill(`${date}T08:00`); await windowForm.getByLabel("Fim", { exact: true }).fill(`${date}T18:00`); await save(page, "Guardar janela");
  await query(page); await expect(page.locator(".calendar-result").getByRole("status")).toHaveText("Há recursos livres na agenda.");
  await expect(page.locator(".calendar-result").getByText("Jipe da Serra", { exact: true })).toBeVisible();
  await expect(page.locator(".calendar-result").getByText("João da Agenda", { exact: true })).toBeVisible();
  await open(page, "Adicionar bloqueio", "Guardar bloqueio"); await page.getByLabel("Recurso bloqueado").selectOption(`vehicle:${vehicleId}`);
  const blockForm = page.getByRole("button", { name: "Guardar bloqueio", exact: true }).locator("..");
  await blockForm.getByLabel("Início", { exact: true }).fill(`${date}T09:50`); await blockForm.getByLabel("Fim", { exact: true }).fill(`${date}T10:00`);
  await page.getByLabel("Motivo do bloqueio").fill("Manutenção de teste"); await save(page, "Guardar bloqueio");
  await query(page); await expect(page.locator(".calendar-result").getByRole("alert")).toHaveText("Sem veículo compatível com capacidade e agenda livres.");
  await page.locator(".calendar-result").getByRole("link", { name: `${date} às 14:00`, exact: true }).click();
  await expect(page.locator(".calendar-result").getByRole("status")).toHaveText("Há recursos livres na agenda.");
  await expect(page.getByLabel("Hora de saída", { exact: true })).toHaveValue("14:00");
  const before = await version(); await page.getByRole("button", { name: "Retirar bloqueio", exact: true }).click();
  await expect.poll(version).toBe(before + 1); await expect(page.getByRole("button", { name: "Retirar bloqueio", exact: true })).toHaveCount(0);
  await query(page); await expect(page.locator(".calendar-result").getByRole("status")).toHaveText("Há recursos livres na agenda.");
  for (const summary of await page.locator("details[open] > summary").all()) await summary.click();
  expect((await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).status).toBe("ONBOARDING");
  await page.screenshot({ path: "test-results/availability.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/availability-mobile.png", fullPage: true, caret: "initial" }); expect(errors).toEqual([]);
});

test("viewer can query, dispatcher manages resource blocks and other tenants stay private", async ({ page, browser }) => {
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_VIEWER" } });
  await login(page, ownerEmail); await page.goto(path());
  await expect(page.getByRole("button", { name: "Consultar agenda", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guardar saída", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar janela", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar fuso horário", exact: true })).toHaveCount(0);
  const before = await version(); await query(page); expect(await version()).toBe(before);
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_DISPATCHER" } });
  await page.goto(path()); await expect(page.getByRole("button", { name: "Guardar saída", exact: true })).toHaveCount(0);
  await open(page, "Adicionar bloqueio", "Guardar bloqueio"); await page.getByLabel("Recurso bloqueado").selectOption(`driver:${driverId}`);
  const form = page.getByRole("button", { name: "Guardar bloqueio", exact: true }).locator("..");
  await form.getByLabel("Início", { exact: true }).fill(`${date}T18:30`); await form.getByLabel("Fim", { exact: true }).fill(`${date}T19:00`);
  await page.getByLabel("Motivo do bloqueio").fill("Pausa do motorista"); await save(page, "Guardar bloqueio");
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "DRIVER" } });
  expect((await page.goto(path()))?.status()).toBe(404);
  const context = await browser.newContext(); const other = await context.newPage();
  await other.goto(path()); await expect(other).toHaveURL(/\/login$/); await login(other, outsiderEmail);
  expect((await other.goto(path()))?.status()).toBe(404); await context.close();
});
