import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Add a name here when a new module is created under src/modules.
const modules = ["tenants", "access", "catalogue", "media", "site", "calendar", "editor"];

const restrictModuleInternals = (allowedModule) => [
  "error",
  {
    patterns: [
      {
        // client.ts is a module's second public entry: its pure code, safe to import from client components.
        group: ["@/modules/*/*", "!@/modules/*/client", ...(allowedModule ? [`!@/modules/${allowedModule}/*`] : [])],
        message: "Import modules only through their index.ts (or client.ts from client components)",
      },
    ],
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "no-restricted-imports": restrictModuleInternals() } },
  // A module may import its own internals.
  ...modules.map((name) => ({
    files: [`src/modules/${name}/**`],
    rules: { "no-restricted-imports": restrictModuleInternals(name) },
  })),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deliberately bad code; linted by tests/lint via the Node API.
    "tests/lint/fixtures/**",
  ]),
]);

export default eslintConfig;
