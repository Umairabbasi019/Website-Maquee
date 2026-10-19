import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async () => ({ error: null }));
const recordAudit = vi.fn(async () => undefined);
const requirePerm = vi.fn<(tenantId: string, key: string) => Promise<{ userId: string }>>(async () => ({ userId: "user-1" }));

vi.mock("@/modules/access", () => ({
  requirePerm,
  recordAudit,
  createServiceClient: () => ({ from: () => ({ upsert }) }),
}));

const { encryptSecret, saveTenantSecret } = await import("@/modules/tenants");
// decryptSecret is deliberately not exported from the module index.
const { decryptSecret } = await import("@/modules/tenants/server/secrets");

const TENANT = "11111111-1111-4111-8111-111111111111";
const key = () => randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.TENANT_SECRETS_KEY = key();
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.TENANT_SECRETS_KEY;
});

describe("encryptSecret / decryptSecret", () => {
  it("round trips and uses v1:iv:tag:data format", () => {
    const c = encryptSecret("sk_live_abc");
    expect(c.split(":")).toHaveLength(4);
    expect(c.startsWith("v1:")).toBe(true);
    expect(c).not.toContain("sk_live_abc");
    expect(decryptSecret(c)).toBe("sk_live_abc");
  });

  it("uses a fresh iv each time", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("throws on tampered tag", () => {
    const [v, iv, tag, data] = encryptSecret("hello").split(":");
    const bad = Buffer.from(tag, "base64");
    bad[0] ^= 1;
    expect(() => decryptSecret([v, iv, bad.toString("base64"), data].join(":"))).toThrow();
  });

  it("throws with the wrong key", () => {
    const c = encryptSecret("hello");
    process.env.TENANT_SECRETS_KEY = key();
    expect(() => decryptSecret(c)).toThrow();
  });

  it("throws a clear error for missing or short key", () => {
    delete process.env.TENANT_SECRETS_KEY;
    expect(() => encryptSecret("x")).toThrow(/TENANT_SECRETS_KEY/);
    process.env.TENANT_SECRETS_KEY = randomBytes(16).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/TENANT_SECRETS_KEY/);
  });

  it("rejects malformed ciphertext", () => {
    expect(() => decryptSecret("nope")).toThrow();
  });
});

describe("saveTenantSecret", () => {
  it("checks permission, stores ciphertext, audits without the value", async () => {
    await saveTenantSecret(TENANT, "payments", "SUPERSECRET");
    expect(requirePerm).toHaveBeenCalledWith(TENANT, "platform.tenants.manage");
    const row = (upsert.mock.calls[0] as unknown[])[0] as Record<string, string>;
    expect(row).toMatchObject({ tenant_id: TENANT, kind: "payments", updated_by: "user-1" });
    expect(row.ciphertext).not.toContain("SUPERSECRET");
    expect(decryptSecret(row.ciphertext)).toBe("SUPERSECRET");
    const audit = JSON.stringify(recordAudit.mock.calls);
    expect(audit).toContain("tenant.secret.save");
    expect(audit).toContain("payments");
    const input = (recordAudit.mock.calls[0] as unknown[])[0] as { entityId: string };
    expect(input.entityId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(audit).not.toContain("SUPERSECRET");
    expect(audit).not.toContain(row.ciphertext);
  });

  it("does nothing when permission is denied", async () => {
    requirePerm.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(saveTenantSecret("t1", "email", "x")).rejects.toThrow("Forbidden");
    expect(upsert).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
