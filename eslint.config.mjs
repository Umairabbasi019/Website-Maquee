import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Add a name here when a new module is created under src/modules.
const modules = ["tenants", "access", "catalogue", "media"];

const restrictModuleInternals = (allowedModule) => [
  "error",
  {
    patterns: [
      {
        group: ["@/modules/*/*", ...(allowedModule ? [`!@/modules/${allowedModule}/*`] : [])],
        message: "Import modules only through their index.ts",
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
