import { describe, expect, it } from "vitest";
import { serviceInput, servicePriceToCents } from "../src/modules/services/domain";
import { vehicleInput } from "../src/modules/vehicles/domain";
import { driverInput, transitionDriver } from "../src/modules/drivers/domain";
import { assertCatalogWritable, catalogQuery } from "../src/modules/tenants/catalog-domain";
import { requirePermission } from "../src/modules/auth/policy";
const service = { name: "Sintra Tour", description: "Tour de Sintra", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4950, currency: "EUR", capacity: 6, meetingPoint: "Estação de Sintra", pickupAvailable: false, pickupRules: "", languages: ["pt", "en"], active: false };
const vehicle = { name: "Jipe Sintra", type: "JEEP", registration: "00-aa-01", capacity: 6, features: ["Ar condicionado"], active: false };
const driver = { name: "João Teste", phone: "+351 912345678", email: " DRIVER@EXAMPLE.TEST ", languages: ["pt"] };

describe("service catalog", () => {
  it("keeps monetary precision without float conversion and rejects ambiguous prices", () => {
    expect(servicePriceToCents("49,90")).toBe(4990);
    expect(servicePriceToCents("0.01")).toBe(1);
    expect(servicePriceToCents("499")).toBe(49900);
    for (const value of ["1.234", "-1", "1e3", "", "1,234.00", "1000000.01"]) expect(() => servicePriceToCents(value)).toThrow();
  });
  it("accepts the planned tour fields and rejects unsafe duration, capacity and price", () => {
    expect(serviceInput.parse(service)).toMatchObject({ basePriceCents: 4950, active: false });
    for (const input of [{ ...service, capacity: 0 }, { ...service, capacity: 101 }, { ...service, durationMinutes: 1.5 }, { ...service, durationMinutes: 1441 }, { ...service, basePriceCents: -1 }, { ...service, currency: "USD" }]) expect(serviceInput.safeParse(input).success).toBe(false);
  });
  it("requires pickup rules only when pickup is available", () => {
    expect(serviceInput.safeParse({ ...service, pickupAvailable: true }).success).toBe(false);
    expect(serviceInput.safeParse({ ...service, pickupRules: "Hotel" }).success).toBe(false);
    expect(serviceInput.safeParse({ ...service, pickupAvailable: true, pickupRules: "Hotel em Sintra" }).success).toBe(true);
  });
  it("requires supported, unique languages and rejects injected tenant/status fields", () => {
    for (const languages of [[], ["xx"], ["pt", "pt"]]) expect(serviceInput.safeParse({ ...service, languages }).success).toBe(false);
    expect(serviceInput.safeParse({ ...service, organizationId: "foreign" }).success).toBe(false);
    expect(driverInput.safeParse({ ...driver, status: "ACTIVE" }).success).toBe(false);
  });
});
describe("vehicles and drivers", () => {
  it("normalizes plates before uniqueness checks without assuming a national plate format", () => {
    expect(vehicleInput.parse(vehicle).registration).toBe("00AA01");
    expect(vehicleInput.parse({ ...vehicle, registration: "00 AA 01" }).registration).toBe("00AA01");
    for (const registration of ["---", "../AA01", "áá0011"]) expect(vehicleInput.safeParse({ ...vehicle, registration }).success).toBe(false);
  });
  it("bounds and deduplicates vehicle features", () => {
    expect(vehicleInput.safeParse({ ...vehicle, features: ["AC", "ac"] }).success).toBe(false);
    expect(vehicleInput.safeParse({ ...vehicle, features: Array.from({ length: 11 }, (_, i) => `Feature ${i}`) }).success).toBe(false);
  });
  it("normalizes driver email and validates contact data", () => {
    expect(driverInput.parse(driver).email).toBe("driver@example.test");
    expect(driverInput.safeParse({ ...driver, phone: "invalid" }).success).toBe(false);
    expect(driverInput.safeParse({ ...driver, email: "invalid" }).success).toBe(false);
  });
  it("requires explicit transitions and pending review after suspension", () => {
    expect(transitionDriver("PENDING", "ACTIVE")).toBe("ACTIVE");
    expect(transitionDriver("ACTIVE", "SUSPENDED")).toBe("SUSPENDED");
    expect(() => transitionDriver("SUSPENDED", "ACTIVE")).toThrow();
    expect(transitionDriver("SUSPENDED", "PENDING")).toBe("PENDING");
    expect(() => transitionDriver("PENDING", "INVITED")).toThrow();
    expect(() => transitionDriver("ACTIVE", "LIVE")).toThrow();
  });
});
describe("catalog boundaries", () => {
  it("allows preparation during onboarding without publishing or bypassing suspension", () => {
    for (const status of ["ONBOARDING", "DOCS_PENDING", "UNDER_REVIEW", "APPROVED", "SANDBOX", "LIVE"] as const) expect(() => assertCatalogWritable(status)).not.toThrow();
    for (const status of ["LEAD", "CONTRACTED", "SUSPENDED", "RESTRICTED"] as const) expect(() => assertCatalogWritable(status)).toThrow();
  });
  it("separates catalog ownership, resource management and read access", () => {
    const context = { actorId: "user", organizationId: "org", role: "OPERATOR_DISPATCHER" as const };
    expect(() => requirePermission(context, "resources:manage")).not.toThrow();
    expect(() => requirePermission(context, "catalog:manage")).toThrow();
    expect(() => requirePermission({ ...context, role: "OPERATOR_VIEWER" }, "resources:manage")).toThrow();
    expect(() => requirePermission({ ...context, role: "DRIVER" }, "organization:read")).toThrow();
  });
  it("bounds list filters and rejects invalid pagination", () => {
    expect(catalogQuery.parse({}).page).toBe(1);
    expect(catalogQuery.safeParse({ page: -1 }).success).toBe(false);
    expect(catalogQuery.safeParse({ page: 1.5 }).success).toBe(false);
    expect(catalogQuery.safeParse({ active: "wrong" }).success).toBe(false);
  });
});
