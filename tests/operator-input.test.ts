import { describe, expect, it } from "vitest";
import { createOperatorInput, operatorInput, priceToCents } from "../src/modules/tenants/input";

const valid = { name: "Sintra Mountain", slug: "sintra-mountain", responsibleName: "João", contactEmail: "  JOAO@example.test ", contactPhone: "+351 912345678", plan: "MANAGED", setupPaid: true, monthlyPriceCents: 49900, primaryLanguage: "pt" };
describe("operator input boundaries", () => {
  it("normalizes email and preserves integer cents", () => {
    const parsed = createOperatorInput.parse(valid);
    expect(parsed.contactEmail).toBe("joao@example.test");
    expect(parsed.monthlyPriceCents).toBe(49900);
  });
  it("rejects attempted privilege, status and tenant injection", () => {
    for (const field of ["role", "status", "organizationId", "platformRole"]) expect(createOperatorInput.safeParse({ ...valid, [field]: "SUPER_ADMIN" }).success).toBe(false);
  });
  it("rejects malformed emails, slugs, unsupported plans and negative prices", () => {
    for (const patch of [{ contactEmail: "a@b.test,c@d.test" }, { slug: "../admin" }, { plan: "FREE" }, { monthlyPriceCents: -1 }, { monthlyPriceCents: 1.5 }, { primaryLanguage: "xx" }]) expect(createOperatorInput.safeParse({ ...valid, ...patch }).success).toBe(false);
    expect(operatorInput.safeParse({}).success).toBe(false);
  });
  it("parses money without floating point multiplication", () => {
    expect(priceToCents("499,99")).toBe(49999);
    expect(priceToCents("0.29")).toBe(29);
    expect(priceToCents("5")).toBe(500);
    for (const invalid of ["-1", "1e3", "1.999", "Infinity", ""]) expect(() => priceToCents(invalid)).toThrow();
  });
});
