import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command:
      "AI_ENABLED=false MAIL_DELIVERY=local MAIL_DIRECTORY=/tmp/study-os-e2e-mail APP_URL=http://127.0.0.1:3100 DATABASE_PATH=/tmp/study-os-e2e.sqlite PORT=3100 npm run dev",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
  },
  reporter: "list",
});
