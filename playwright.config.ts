import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3108);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `pnpm ${process.env.PLAYWRIGHT_USE_PRODUCTION === "true" ? "start" : "dev"} --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    // Public-page smoke tests must never inherit live database/provider credentials.
    env: {
      SKIP_ENV_VALIDATION: "true",
      DATABASE_URL: "postgresql://offline:offline@127.0.0.1:9/inklings",
      OPENAI_API_KEY: "offline-test-only",
      ANTHROPIC_API_KEY: "offline-test-only",
      SESSION_SECRET: "offline-test-only-32-characters-long",
      INNGEST_DEV: "1",
      INNGEST_EVENT_KEY: "",
      INNGEST_SIGNING_KEY: "",
    },
    timeout: 120_000,
  },
});
