import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/modules/access/server/supabase", () => ({ createServerClient: async () => ({ rpc }) }));

const { recordAudit, recordAuditAfterCommit } = await import("@/modules/access/server/audit");
const entry = { tenantId: "t1", action: "payment.verify", entity: "payment", entityId: "p1" };

afterEach(() => vi.restoreAllMocks());

describe("recordAuditAfterCommit", () => {
  it("logs a failed audit write instead of throwing it", async () => {
    rpc.mockResolvedValue({ error: { message: "down" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordAudit(entry)).rejects.toThrow("recordAudit: down");
    await expect(recordAuditAfterCommit(entry)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("audit payment.verify failed for payment p1", expect.any(Error));
  });

  it("writes the entry when the database takes it", async () => {
    rpc.mockResolvedValue({ error: null });
    await recordAuditAfterCommit(entry);
    expect(rpc).toHaveBeenLastCalledWith("record_audit", expect.objectContaining({ p_tenant: "t1", p_action: "payment.verify", p_entity_id: "p1" }));
  });
});
