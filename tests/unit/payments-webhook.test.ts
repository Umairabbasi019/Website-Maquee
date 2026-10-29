import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const T1 = "00000000-0000-4000-8000-00000000000a";
const T2 = "00000000-0000-4000-8000-00000000000b";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BOOKING = id(1);
const PAYMENT = id(3);
const NEW_PAYMENT = id(5);
const QUOTE = id(6);
const USER = id(9);
const REF = "sbx_ref1";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const rpcs: { fn: string; args: Row }[] = [];
const audits: Row[] = [];
const held = new Set<string>();
let secret: string | null = "venue-secret";
let rpcResult = "applied";

function reset() {
  Object.assign(tables, {
    tenants: [
      { id: T1, currency: "PKR" },
      { id: T2, currency: "PKR" },
    ],
    tenant_settings: [{ tenant_id: T1, money_rules: { paymentMethods: ["bank", "gateway"] } }],
    bookings: [
      { tenant_id: T1, id: BOOKING, status: "awaiting_advance", current_quote_id: QUOTE },
      { tenant_id: T1, id: id(2), status: "requested", current_quote_id: null },
    ],
    quotes: [{ tenant_id: T1, id: QUOTE, total_paisa: 100_000, advance_paisa: 50_000 }],
    payments: [
      { tenant_id: T1, id: PAYMENT, booking_id: BOOKING, kind: "payment", status: "pending", amount_paisa: 50_000, provider: "sandbox", provider_ref: REF },
    ],
  });
}

function query(table: string) {
  let rows = tables[table] ?? [];
  const q = {
    select: () => q,
    returns: () => q,
    eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return q;
}

class ForbiddenError extends Error {}
vi.mock("@/modules/access", () => ({
  requirePerm: async (_t: string, key: string) => {
    if (!held.has(key)) throw new ForbiddenError(key);
    return { userId: USER };
  },
  recordAuditAfterCommit: async (a: Row) => void audits.push(a),
  createServerClient: async () => ({ from: query }),
  createServiceClient: () => ({
    from: query,
    rpc: async (fn: string, args: Row) => {
      rpcs.push({ fn, args });
      return { data: fn === "record_payment" ? NEW_PAYMENT : rpcResult, error: null };
    },
  }),
}));
vi.mock("@/modules/booking", () => ({
  check: (r: { data: unknown }) => r.data,
}));
vi.mock("@/modules/tenants", async () => ({
  MoneyRulesSchema: (await import("@/modules/tenants/settings")).MoneyRulesSchema,
  readTenantSecret: async () => secret,
}));

const { handleWebhook, startOnlinePayment, checkOnlineStatus, sandboxCheckout, completeSandbox } = await import("@/modules/payments/server/online");
const { sandboxProvider, signSandbox } = await import("@/modules/payments/providers/sandbox");
const { POST } = await import("@/app/api/payments/webhook/[provider]/route");

const EVENT = { eventId: "sbx_evt_1", providerRef: REF, status: "paid", amountPaisa: 50_000, currency: "PKR" };
const body = JSON.stringify(EVENT);
const signedHeaders = (b = body, s = "venue-secret") => new Headers({ "x-sandbox-signature": signSandbox(b, s) });
const applied = () => rpcs.filter((r) => r.fn === "apply_provider_event");

beforeEach(() => {
  reset();
  rpcs.length = 0;
  audits.length = 0;
  held.clear();
  held.add("payments.verify");
  secret = "venue-secret";
  rpcResult = "applied";
  vi.stubEnv("PAYMENTS_SANDBOX", "1");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("handleWebhook", () => {
  it("applies a signed event and answers 200 with the SQL result", async () => {
    await expect(handleWebhook("sandbox", body, signedHeaders())).resolves.toEqual({ status: 200, result: "applied" });
    expect(applied()).toEqual([
      { fn: "apply_provider_event", args: { p_provider: "sandbox", p_event_id: "sbx_evt_1", p_provider_ref: REF, p_status: "paid", p_amount: 50_000, p_currency: "PKR", p_payload: EVENT } },
    ]);
  });

  it("answers 200 for a duplicate or a mismatch so the gateway stops retrying", async () => {
    for (const result of ["duplicate", "mismatch"]) {
      rpcResult = result;
      await expect(handleWebhook("sandbox", body, signedHeaders())).resolves.toEqual({ status: 200, result });
    }
  });

  it("answers 400 for a bad signature, and writes nothing", async () => {
    await expect(handleWebhook("sandbox", body, signedHeaders(body, "wrong"))).resolves.toEqual({ status: 400 });
    await expect(handleWebhook("sandbox", body, new Headers())).resolves.toEqual({ status: 400 });
    expect(rpcs).toEqual([]);
  });

  it("answers 404 for an unknown provider and when the sandbox is off", async () => {
    await expect(handleWebhook("stripe", body, signedHeaders())).resolves.toEqual({ status: 404 });
    vi.stubEnv("PAYMENTS_SANDBOX", "");
    await expect(handleWebhook("sandbox", body, signedHeaders())).resolves.toEqual({ status: 404 });
    expect(rpcs).toEqual([]);
  });

  it("answers 400 for an unknown reference, an unreadable body and a venue with no secret", async () => {
    const other = JSON.stringify({ ...EVENT, providerRef: "sbx_none" });
    await expect(handleWebhook("sandbox", other, signedHeaders(other))).resolves.toEqual({ status: 400 });
    await expect(handleWebhook("sandbox", "nope", signedHeaders("nope"))).resolves.toEqual({ status: 400 });
    secret = null;
    await expect(handleWebhook("sandbox", body, signedHeaders())).resolves.toEqual({ status: 400 });
    expect(rpcs).toEqual([]);
  });
});

describe("webhook route", () => {
  const call = (provider: string, b: string, headers: Headers) =>
    POST(new Request(`http://x/api/payments/webhook/${provider}`, { method: "POST", body: b, headers }), { params: Promise.resolve({ provider }) });

  it("returns 400 for a bad signature without calling apply_provider_event", async () => {
    const res = await call("sandbox", body, signedHeaders(body, "wrong"));
    expect(res.status).toBe(400);
    expect(applied()).toEqual([]);
  });

  it("returns 404 for an unknown provider", async () => {
    expect((await call("nope", body, signedHeaders())).status).toBe(404);
  });

  it("returns 200 and the result for a good delivery", async () => {
    const res = await call("sandbox", body, signedHeaders());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ result: "applied" });
  });
});

describe("startOnlinePayment", () => {
  const start = (booking = BOOKING) => startOnlinePayment(T1, booking, "/b/tok");

  it("is off without the gateway method, without a provider and without a saved secret", async () => {
    tables.tenant_settings[0].money_rules = { paymentMethods: ["bank"] };
    await expect(start()).resolves.toEqual({ error: "off" });
    reset();
    secret = null;
    await expect(start()).resolves.toEqual({ error: "off" });
    secret = "venue-secret";
    vi.stubEnv("PAYMENTS_SANDBOX", "");
    await expect(start()).resolves.toEqual({ error: "off" });
    expect(rpcs).toEqual([]);
  });

  it("records a pending provider payment of the whole advance, then returns the checkout redirect", async () => {
    const r = await start();
    const [rec] = rpcs;
    expect(rec.fn).toBe("record_payment");
    expect(rec.args).toMatchObject({ p_booking: BOOKING, p_kind: "payment", p_method: "online", p_amount: 50_000, p_source: "provider", p_provider: "sandbox", p_actor: null });
    expect(rec.args.p_provider_ref).toMatch(/^sbx_/);
    expect(r).toEqual({ redirectUrl: `/pay/sandbox/${rec.args.p_provider_ref}` });
  });

  it("asks for the remaining advance first, then the balance once the advance is met", async () => {
    tables.payments.push({ tenant_id: T1, id: id(7), booking_id: BOOKING, kind: "payment", status: "verified", amount_paisa: 20_000 });
    await start();
    expect(rpcs[0].args.p_amount).toBe(30_000);
    rpcs.length = 0;
    tables.payments.push({ tenant_id: T1, id: id(8), booking_id: BOOKING, kind: "payment", status: "verified", amount_paisa: 30_000 });
    await start();
    expect(rpcs[0].args.p_amount).toBe(50_000);
  });

  it("leaves the pending row when the provider fails", async () => {
    vi.spyOn(sandboxProvider, "createPayment").mockRejectedValueOnce(new Error("gateway down"));
    await expect(start()).rejects.toThrow("gateway down");
    expect(rpcs.map((r) => r.fn)).toEqual(["record_payment"]);
  });

  it("refuses a booking that is fully paid, one that cannot take payment, and another venue", async () => {
    await expect(start(id(2))).resolves.toEqual({ error: "state" });
    await expect(startOnlinePayment(T2, BOOKING, "/b/tok")).resolves.toEqual({ error: "off" });
    tables.payments.push({ tenant_id: T1, id: id(7), booking_id: BOOKING, kind: "payment", status: "verified", amount_paisa: 100_000 });
    await expect(start()).resolves.toEqual({ error: "amount" });
    expect(rpcs).toEqual([]);
  });
});

describe("checkOnlineStatus", () => {
  it("is forbidden without payments.verify", async () => {
    held.delete("payments.verify");
    await expect(checkOnlineStatus(T1, PAYMENT)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("changes nothing while the provider says pending", async () => {
    vi.spyOn(sandboxProvider, "getStatus").mockResolvedValueOnce("pending");
    await expect(checkOnlineStatus(T1, PAYMENT)).resolves.toEqual({ ok: true });
    expect(rpcs).toEqual([]);
  });

  it("applies a paid status under the event id status:<ref>:<status>, then audits", async () => {
    vi.spyOn(sandboxProvider, "getStatus").mockResolvedValueOnce("paid");
    await expect(checkOnlineStatus(T1, PAYMENT)).resolves.toEqual({ ok: true });
    expect(rpcs).toEqual([
      { fn: "apply_provider_event", args: { p_provider: "sandbox", p_event_id: `status:${REF}:paid`, p_provider_ref: REF, p_status: "paid", p_amount: 50_000, p_currency: "PKR", p_payload: { source: "status check" } } },
    ]);
    expect(audits[0]).toMatchObject({ tenantId: T1, action: "payment.check_status", entityId: PAYMENT, after: { status: "paid", result: "applied" } });
  });

  it("gives notFound for another venue's payment and state for a payment with no provider", async () => {
    await expect(checkOnlineStatus(T2, PAYMENT)).resolves.toEqual({ error: "notFound" });
    tables.payments[0].provider = null;
    await expect(checkOnlineStatus(T1, PAYMENT)).resolves.toEqual({ error: "state" });
  });
});

describe("sandbox checkout", () => {
  it("finds a payment by reference, or null when the sandbox is off or the reference is unknown", async () => {
    await expect(sandboxCheckout(REF)).resolves.toEqual({ amountPaisa: 50_000 });
    await expect(sandboxCheckout("sbx_none")).resolves.toBeNull();
    vi.stubEnv("PAYMENTS_SANDBOX", "");
    await expect(sandboxCheckout(REF)).resolves.toBeNull();
  });

  it("signs a paid event with the venue secret and sends it through the webhook code", async () => {
    await expect(completeSandbox(REF, "paid")).resolves.toBe(true);
    expect(applied()).toHaveLength(1);
    expect(applied()[0].args).toMatchObject({ p_provider: "sandbox", p_provider_ref: REF, p_status: "paid", p_amount: 50_000, p_currency: "PKR" });
    expect(applied()[0].args.p_event_id).toMatch(/^sbx_evt_[A-Za-z0-9_-]{16}$/);
  });

  it("is false and writes nothing for an unknown reference or an unknown outcome", async () => {
    await expect(completeSandbox("sbx_none", "paid")).resolves.toBe(false);
    await expect(completeSandbox(REF, "refunded" as never)).resolves.toBe(false);
    expect(rpcs).toEqual([]);
  });
});
