import "dotenv/config";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("E2E requires a dedicated DATABASE_URL ending in _test.");
process.env.AUTH_SECRET ??= randomBytes(32).toString("hex");
process.env.AUTH_URL = "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100", screenshot: "only-on-failure", trace: "retain-on-failure" },
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "development", DATABASE_URL: databaseUrl, AUTH_URL: process.env.AUTH_URL,
      AUTH_SECRET: process.env.AUTH_SECRET,
      EMAIL_SERVER_HOST: "localhost", EMAIL_SERVER_PORT: "1025", EMAIL_SERVER_USER: "local",
      EMAIL_SERVER_PASSWORD: "local", EMAIL_FROM: "tourflow@example.test",
    },
  },
});
