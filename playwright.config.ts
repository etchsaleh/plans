import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    // Use a preinstalled Chromium when the bundled one isn't downloaded (e.g. CI images).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"], browserName: "chromium" } },
  ],
  webServer: {
    // Production build + mock verifier + in-process jobs; magic links land in /dev/mailbox.
    command: `npm run db:seed:venues && npm run start -- -p ${PORT}`,
    env: {
      APP_URL: `http://localhost:${PORT}`,
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://plan@localhost:5433/plan_e2e",
      COOKIE_SECRET: "e2e-cookie-secret-e2e-cookie-secret-123456",
      ORGANIZER_EMAILS: "organizer@example.test",
      DEV_MAILBOX: "true",
      JOBS_MODE: "inline",
      VERIFIERS: "mock",
      LOG_LEVEL: "warn",
    },
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
