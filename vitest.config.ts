import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// DB tests need the same .env.local the app reads (Supabase URL and keys). Already-set variables win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
// Test-only value, so booking hashing does not warn about the development fallback.
process.env.BOOKING_HASH_SECRET ??= "test-only-booking-hash-secret";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // The real package throws outside a server build; tests run in plain Node.
  "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
  // The real loader needs the Next.js compiler.
  "next/font/google": fileURLToPath(new URL("./tests/stubs/next-font.ts", import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", testTimeout: 30_000, include: ["tests/unit/**/*.test.{ts,tsx}", "tests/lint/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: { name: "db", include: ["tests/db/**/*.test.ts"] },
      },
    ],
  },
});
