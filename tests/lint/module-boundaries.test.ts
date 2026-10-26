import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// ignore: false because eslint.config.mjs globally ignores the fixtures folder.
const eslint = new ESLint({ ignore: false });

async function restrictedImportErrors(file: string) {
  const [result] = await eslint.lintFiles([file]);
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("module boundaries", () => {
  it("rejects deep imports into a module", async () => {
    const errors = await restrictedImportErrors("tests/lint/fixtures/bad-import.ts");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe(2);
    expect(errors[0].message).toContain("Import modules only through their index.ts");
  });

  it("allows imports through a module index or its client entry", async () => {
    expect(await restrictedImportErrors("tests/lint/fixtures/good-import.ts")).toHaveLength(0);
  });
});
