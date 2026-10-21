import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Tests sign in as the seeded demo users and need SEED_USER_PASSWORD; run `npm run db:seed` first.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "tests/e2e",
  // Specs share one seeded database and change it (pause demo-hall, limits); run them one at a time.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 180_000 },
});
