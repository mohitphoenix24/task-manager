import { defineConfig, devices } from "@playwright/test";

// PW_LOCAL_CHROME lets contributors without sudo (can't run `playwright install
// --with-deps`) point Playwright at their system Chrome instead. CI always
// installs Playwright's own Chromium and leaves this unset.
const channel = process.env.PW_LOCAL_CHROME ? "chrome" : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel },
    },
  ],
});
