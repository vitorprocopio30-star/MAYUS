import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.PORT || 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;
const googleFontsMockPath = path.resolve(
  process.cwd(),
  "e2e",
  "fixtures",
  "next-google-fonts-mock.cjs",
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    env: {
      ...process.env,
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES:
        process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES || googleFontsMockPath,
    },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
