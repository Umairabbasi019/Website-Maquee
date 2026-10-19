import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", testTimeout: 30_000, include: ["tests/unit/**/*.test.ts", "tests/lint/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: { name: "db", include: ["tests/db/**/*.test.ts"] },
      },
    ],
  },
});
