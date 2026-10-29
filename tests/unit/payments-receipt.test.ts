import { beforeEach, describe, expect, it, vi } from "vitest";

const T1 = "00000000-0000-4000-8000-00000000000a";
const T2 = "00000000-0000-4000-8000-00000000000b";
const BOOKING = "00000000-0000-4000-8000-000000000001";
const NEW_PAYMENT = "00000000-0000-4000-8000-000000000005";
const TOKEN = "t".repeat(43);

type Row = Record<string, unknown>;
const rpcs: Row[] = [];
const uploads: string[] = [];
const deletes: string[] = [];
let rpcError: { code: string; message: string } | null = null;
let uploadResult: "ok" | "error" | "throw" = "ok";
let deleteError: { message: string } | null = null;
let rules: Row = {};

const result = (table: string, deleting: boolean) => {
  if (deleting) return { error: deleteError };
  const data: Record<string, unknown> = {
    bookings: { status: "awaiting_advance", current_quote_id: "q1" },
    quotes: { total_paisa: 100_000, advance_paisa: 50_000 },
    payments: [],
    tenant_settings: { money_rules: rules },
  };
  return { data: data[table], error: null };
};
const query = (table: string) => {
  let deleting = false;
  const c: Record<string, unknown> = {};
  for (const m of ["select", "order", "returns", "single", "maybeSingle"]) c[m] = () => c;
  c.eq = (col: string, v: string) => (deleting && col === "id" && deletes.push(v), c);
  c.delete = () => ((deleting = true), c);
  c.then = (res: (v: unknown) => unknown) => res(result(table, deleting));
  return c;
};

vi.mock("@/modules/access", () => ({
  requirePerm: async () => ({}),
  recordAuditAfterCommit: async () => undefined,
  createServerClient: async () => ({ from: query }),
  createServiceClient: () => ({
    from: query,
    rpc: async (_fn: string, args: Row) => (rpcs.push(args), { data: rpcError ? null : NEW_PAYMENT, error: rpcError }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          if (uploadResult === "throw") throw new Error("network");
          return { error: uploadResult === "error" ? { message: "down" } : null };
        },
      }),
    },
  }),
}));
vi.mock("@/modules/booking", () => ({
  check: (r: { data: unknown; error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  },
  // The token belongs to T1 only; any other host's tenant finds nothing.
  resolveBookingToken: async (_token: string, tenant: string) => (tenant === T1 ? { bookingId: BOOKING } : null),
}));
vi.mock("@/modules/media", () => ({ checkImage: async () => ({ meta: { format: "jpeg" } }) }));
vi.mock("@/modules/tenants", () => ({
  MoneyRulesSchema: { parse: (r: Row) => ({ paymentMethods: r.paymentMethods ?? [], paymentAccounts: r.paymentAccounts ?? {} }) },
}));
vi.mock("@/modules/payments/server/online", () => ({ onlineEnabled: async () => false }));

const { uploadReceipt } = await import("@/modules/payments/server/customer");

const form = (method = "bank", amount = "200") => {
  const fd = new FormData();
  fd.set("method", method);
  fd.set("amount", amount);
  fd.set("receipt", new File([new Uint8Array([1, 2, 3])], "r.jpg", { type: "image/jpeg" }));
  return fd;
};

beforeEach(() => {
  rpcs.length = 0;
  uploads.length = 0;
  deletes.length = 0;
  rpcError = null;
  uploadResult = "ok";
  deleteError = null;
  rules = { paymentMethods: ["bank", "jazzcash"], paymentAccounts: { bank: { bankName: "B", accountTitle: "T", accountNumber: "1" } } };
});

describe("uploadReceipt", () => {
  it("saves a pending receipt row, then the file under the venue and booking", async () => {
    await expect(uploadReceipt(T1, TOKEN, form())).resolves.toEqual({ ok: true });
    expect(rpcs[0]).toMatchObject({ p_booking: BOOKING, p_method: "bank", p_amount: 20_000, p_source: "customer_receipt", p_actor: null });
    expect(uploads).toEqual([rpcs[0].p_receipt_path]);
    expect(uploads[0]).toMatch(new RegExp(`^${T1}/${BOOKING}/[0-9a-f-]{36}\\.jpg$`));
  });

  it("gives invalid for a token on another venue's host, touching nothing", async () => {
    await expect(uploadReceipt(T2, TOKEN, form())).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
    expect(uploads).toEqual([]);
  });

  it("gives invalid for a disabled method or one with no details", async () => {
    await expect(uploadReceipt(T1, TOKEN, form("easypaisa"))).resolves.toEqual({ error: "invalid" });
    await expect(uploadReceipt(T1, TOKEN, form("jazzcash"))).resolves.toEqual({ error: "invalid" });
    await expect(uploadReceipt(T1, TOKEN, form("cash"))).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it("gives amount when the amount is over the balance, with no file stored", async () => {
    rpcError = { code: "P0001", message: "amount_out_of_range" };
    await expect(uploadReceipt(T1, TOKEN, form("bank", "999999"))).resolves.toEqual({ error: "amount" });
    expect(uploads).toEqual([]);
  });

  it("gives limit on receipt_limit and stores no file", async () => {
    rpcError = { code: "P0001", message: "receipt_limit" };
    await expect(uploadReceipt(T1, TOKEN, form())).resolves.toEqual({ error: "limit" });
    expect(uploads).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("deletes the payment row and gives invalid when the upload fails or throws", async () => {
    for (const mode of ["error", "throw"] as const) {
      deletes.length = 0;
      uploadResult = mode;
      await expect(uploadReceipt(T1, TOKEN, form())).resolves.toEqual({ error: "invalid" });
      expect(deletes).toEqual([NEW_PAYMENT]);
    }
  });

  it("throws when the rollback delete itself fails", async () => {
    uploadResult = "error";
    deleteError = { message: "locked" };
    await expect(uploadReceipt(T1, TOKEN, form())).rejects.toThrow("receipt rollback: locked");
  });
});
