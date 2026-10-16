import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("repository foundation", () => {
  it("renders the initial page with an accessible main landmark and project identity", () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("<main>");
    expect(html).toContain("<h1>TourFlow</h1>");
    expect(html).toContain("Plataforma em preparação.");
  });

  it("keeps persistent context available for subsequent sprints", () => {
    for (const name of ["PRODUCT", "ARCHITECTURE", "DATA_MODEL", "CODEX_RULES"]) {
      expect(read(`docs/${name}.md`).trim().length).toBeGreaterThan(100);
    }
    expect(read("AGENTS.md")).toContain("docs/CODEX_RULES.md");
  });

  it("keeps the agreed module boundaries available", () => {
    for (const name of ["auth", "tenants", "compliance", "services", "vehicles", "drivers", "availability", "bookings", "dispatch", "assistants", "audit"]) {
      expect(existsSync(resolve(root, `src/modules/${name}/README.md`))).toBe(true);
    }
  });
});
