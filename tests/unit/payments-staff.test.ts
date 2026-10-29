import { beforeEach, describe, expect, it, vi } from "vitest";

const T1 = "00000000-0000-4000-8000-00000000000a";
const T2 = "00000000-0000-4000-8000-00000000000b";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BOOKING = id(1);
const OTHER_BOOKING = id(2);
const PAYMENT = id(3);
const OTHER_PAYMENT = id(4);
const NEW_PAYMENT = id(5);
const USER = id(9);

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const rpcs: { fn: string; args: Row }[] = [];
const audits: Row[] = [];
const signed: { path: string; seconds: number }[] = [];
const held = new Set<string>();
// Errors the next rpc calls return, one per call; an empty queue means success.
let rpcErrors: ({ code: string; message: string } | null)[] = [];
let failAudit = false;

function reset() {
  Object.assign(tables, {
    bookings: [
      { tenant_id: T1, id: BOOKING, status: "confirmed", advance_due_on: "2027-01-10", pay_later: false },
      { tenant_id: T2, id: OTHER_BOOKING, status: "confirmed", advance_due_on: null, pay_later: false },
    ],
    payments: [
      { tenant_id: T1, id: PAYMENT, booking_id: BOOKING, kind: "payment", method: "bank", amount_paisa: 40_000, status: "pending", source: "customer_receipt", note: null, reject_reason: null, receipt_path: `${T1}/${BOOKING}/${PAYMENT}.jpg`, provider_ref: null, recorded_by: null, verified_by: null, created_at: "2026-10-28T10:00:00Z" },
      { tenant_id: T2, id: OTHER_PAYMENT, booking_id: OTHER_BOOKING, kind: "payment", method: "cash", amount_paisa: 1_000, status: "pending", source: "customer_receipt", note: null, reject_reason: null, receipt_path: null, provider_ref: null, recorded_by: null, verified_by: null, created_at: "2026-10-28T10:00:00Z" },
    ],
  });
}

function query(table: string) {
  let rows = tables[table] ?? [];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
    order: () => q,
    returns: () => q,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return q;
}

class ForbiddenError extends Error {}
const viewer = { userId: USER, isPlatformAdmin: false, aal: "aal1", memberships: [] };

vi.mock("@/modules/access", () => ({
  ForbiddenError,
  requirePerm: async (_t: string, key: string) => {
    if (!held.has(key)) throw new ForbiddenError(key);
    return viewer;
  },
  recordAuditAfterCommit: async (a: Row) => {
    if (failAudit) return console.error(`audit ${a.action} failed`, new Error("audit down"));
    audits.push(a);
  },
  createServerClient: async () => ({ from: query }),
  createServiceClient: () => ({
    from: query,
    rpc: async (fn: string, args: Row) => {
      rpcs.push({ fn, args });
      const error = rpcErrors.shift() ?? null;
      return { data: error ? null : NEW_PAYMENT, error };
    },
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, seconds: number) => (signed.push({ path, seconds }), { data: { signedUrl: `https://files/${path}` }, error: null }),
      }),
    },
  }),
}));

vi.mock("@/modules/booking", () => ({
  check: (r: { data: unknown; error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  },
}));

const { listPayments, recordPayment, rejectPayment, receiptUrl, setPaymentTerms, verifyPayment } = await import("@/modules/payments/server/staff");

beforeEach(() => {
  reset();
  held.clear();
  held.add("payments.verify");
  held.add("payments.view");
  rpcs.length = 0;
  audits.length = 0;
  signed.length = 0;
  rpcErrors = [];
  failAudit = false;
});

const RECORD = { kind: "payment", method: "cash", amountRupees: "500", note: "At the office" } as const;

describe("recordPayment", () => {
  it("calls record_payment as a staff row in paisa, then audits", async () => {
    await expect(recordPayment(T1, BOOKING, RECORD)).resolves.toEqual({ ok: true });
    expect(rpcs).toEqual([
      {
        fn: "record_payment",
        args: { p_booking: BOOKING, p_kind: "payment", p_method: "cash", p_amount: 50_000, p_source: "staff", p_note: "At the office", p_receipt_path: null, p_provider: null, p_provider_ref: null, p_actor: USER },
      },
    ]);
    expect(audits[0]).toMatchObject({ tenantId: T1, action: "payment.record", entity: "payment", entityId: NEW_PAYMENT, after: { kind: "payment", method: "cash", amountPaisa: 50_000 } });
  });

  it("is forbidden without payments.verify, touching nothing", async () => {
    held.delete("payments.verify");
    await expect(recordPayment(T1, BOOKING, RECORD)).rejects.toBeInstanceOf(ForbiddenError);
    expect(rpcs).toEqual([]);
  });

  it("gives notFound for another venue's booking", async () => {
    await expect(recordPayment(T1, OTHER_BOOKING, RECORD)).resolves.toEqual({ error: "notFound" });
    expect(rpcs).toEqual([]);
  });

  it("refuses bad rupees, an unknown or provider-only method, a bad kind and a non-uuid id", async () => {
    for (const amountRupees of ["abc", "", "0", "-5", "1.234"]) {
      await expect(recordPayment(T1, BOOKING, { ...RECORD, amountRupees })).resolves.toEqual({ error: "invalid" });
    }
    await expect(recordPayment(T1, BOOKING, { ...RECORD, method: "online" })).resolves.toEqual({ error: "invalid" });
    await expect(recordPayment(T1, BOOKING, { ...RECORD, method: "crypto" })).resolves.toEqual({ error: "invalid" });
    await expect(recordPayment(T1, BOOKING, { ...RECORD, kind: "gift" as never })).resolves.toEqual({ error: "invalid" });
    await expect(recordPayment(T1, "nope", RECORD)).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it("maps the SQL messages to amount, state, limit and notFound", async () => {
    rpcErrors = [{ code: "P0001", message: "amount_out_of_range" }];
    await expect(recordPayment(T1, BOOKING, RECORD)).resolves.toEqual({ error: "amount" });
    rpcErrors = [{ code: "P0001", message: "payment_state" }];
    await expect(recordPayment(T1, BOOKING, RECORD)).resolves.toEqual({ error: "state" });
    rpcErrors = [{ code: "P0001", message: "receipt_limit" }];
    await expect(recordPayment(T1, BOOKING, RECORD)).resolves.toEqual({ error: "limit" });
    rpcErrors = [{ code: "P0001", message: "not_found" }];
    await expect(recordPayment(T1, BOOKING, RECORD)).resolves.toEqual({ error: "notFound" });
    expect(audits).toEqual([]);
  });

  it("throws on an unknown database error", async () => {
    rpcErrors = [{ code: "XX000", message: "boom" }];
    await expect(recordPayment(T1, BOOKING, RECORD)).rejects.toThrow(/record_payment: boom/);
  });

  it("retries once on a deadlock, then succeeds", async () => {
    rpcErrors = [{ code: "40P01", message: "deadlock detected" }];
    await expect(recordPayment(T1, BOOKING, RECORD)).resolves.toEqual({ ok: true });
    expect(rpcs).toHaveLength(2);
  });

  it("fails after a second deadlock", async () => {
    rpcErrors = [
      { code: "40P01", message: "deadlock detected" },
      { code: "40P01", message: "deadlock detected" },
    ];
    await expect(recordPayment(T1, BOOKING, RECORD)).rejects.toThrow(/deadlock/);
    expect(rpcs).toHaveLength(2);
  });

  it("still succeeds when the audit write fails after the commit", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    failAudit = true;
    await expect(recordPayment(T1, BOOKING, RECORD)).resolves.toEqual({ ok: true });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("verifyPayment", () => {
  it("verifies at the typed amount and audits the old and new amounts", async () => {
    await expect(verifyPayment(T1, PAYMENT, "350")).resolves.toEqual({ ok: true });
    expect(rpcs).toEqual([{ fn: "verify_payment", args: { p_payment: PAYMENT, p_amount: 35_000, p_actor: USER } }]);
    expect(audits[0]).toMatchObject({
      action: "payment.verify",
      entityId: PAYMENT,
      before: { status: "pending", amountPaisa: 40_000 },
      after: { status: "verified", amountPaisa: 35_000 },
    });
  });

  it("is forbidden without payments.verify", async () => {
    held.delete("payments.verify");
    await expect(verifyPayment(T1, PAYMENT, "400")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("gives notFound for another venue's payment id", async () => {
    await expect(verifyPayment(T1, OTHER_PAYMENT, "10")).resolves.toEqual({ error: "notFound" });
    expect(rpcs).toEqual([]);
  });

  it("gives invalid for abc rupees", async () => {
    await expect(verifyPayment(T1, PAYMENT, "abc")).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it("maps amount and state errors", async () => {
    rpcErrors = [{ code: "P0001", message: "amount_out_of_range" }];
    await expect(verifyPayment(T1, PAYMENT, "999999")).resolves.toEqual({ error: "amount" });
    rpcErrors = [{ code: "P0001", message: "payment_state" }];
    await expect(verifyPayment(T1, PAYMENT, "400")).resolves.toEqual({ error: "state" });
  });
});

describe("rejectPayment", () => {
  it("rejects with a trimmed reason and audits it", async () => {
    await expect(rejectPayment(T1, PAYMENT, "  Blurry image ")).resolves.toEqual({ ok: true });
    expect(rpcs[0]).toEqual({ fn: "reject_payment", args: { p_payment: PAYMENT, p_reason: "Blurry image", p_actor: USER } });
    expect(audits[0]).toMatchObject({ action: "payment.reject", reason: "Blurry image", before: { status: "pending" }, after: { status: "rejected" } });
  });

  it("refuses a short or long reason, and another venue's payment", async () => {
    await expect(rejectPayment(T1, PAYMENT, "no")).resolves.toEqual({ error: "invalid" });
    await expect(rejectPayment(T1, PAYMENT, "x".repeat(301))).resolves.toEqual({ error: "invalid" });
    await expect(rejectPayment(T1, OTHER_PAYMENT, "Blurry image")).resolves.toEqual({ error: "notFound" });
    expect(rpcs).toEqual([]);
  });

  it("maps state, and is forbidden without payments.verify", async () => {
    rpcErrors = [{ code: "P0001", message: "payment_state" }];
    await expect(rejectPayment(T1, PAYMENT, "Blurry image")).resolves.toEqual({ error: "state" });
    held.delete("payments.verify");
    await expect(rejectPayment(T1, PAYMENT, "Blurry image")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("setPaymentTerms", () => {
  it("sets the due date and pay-later mark and audits before and after", async () => {
    await expect(setPaymentTerms(T1, BOOKING, { advanceDueOn: "2027-02-01", payLater: true })).resolves.toEqual({ ok: true });
    expect(rpcs[0]).toEqual({ fn: "set_payment_terms", args: { p_booking: BOOKING, p_advance_due_on: "2027-02-01", p_pay_later: true, p_actor: USER } });
    expect(audits[0]).toMatchObject({
      action: "booking.payment_terms",
      entity: "booking",
      entityId: BOOKING,
      before: { advanceDueOn: "2027-01-10", payLater: false },
      after: { advanceDueOn: "2027-02-01", payLater: true },
    });
  });

  it("refuses a bad date and another venue's booking, and maps state", async () => {
    await expect(setPaymentTerms(T1, BOOKING, { advanceDueOn: "2027-02-30", payLater: false })).resolves.toEqual({ error: "invalid" });
    await expect(setPaymentTerms(T1, OTHER_BOOKING, { advanceDueOn: "2027-02-01", payLater: false })).resolves.toEqual({ error: "notFound" });
    rpcErrors = [{ code: "P0001", message: "payment_state" }];
    await expect(setPaymentTerms(T1, BOOKING, { advanceDueOn: "2027-02-01", payLater: false })).resolves.toEqual({ error: "state" });
  });
});

describe("listPayments and receiptUrl", () => {
  it("lists the booking's rows with hasReceipt and no file path", async () => {
    const rows = await listPayments(T1, BOOKING);
    expect(rows).toEqual([
      expect.objectContaining({ id: PAYMENT, kind: "payment", method: "bank", amountPaisa: 40_000, status: "pending", source: "customer_receipt", hasReceipt: true, providerRef: null, createdAt: "2026-10-28T10:00:00Z" }),
    ]);
    expect(JSON.stringify(rows)).not.toContain(".jpg");
  });

  it("lists nothing for another venue's booking and needs payments.view", async () => {
    await expect(listPayments(T1, OTHER_BOOKING)).resolves.toEqual([]);
    held.delete("payments.view");
    await expect(listPayments(T1, BOOKING)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("signs a receipt for 300 seconds, and gives null for none or another venue's payment", async () => {
    await expect(receiptUrl(T1, PAYMENT)).resolves.toBe(`https://files/${T1}/${BOOKING}/${PAYMENT}.jpg`);
    expect(signed).toEqual([{ path: `${T1}/${BOOKING}/${PAYMENT}.jpg`, seconds: 300 }]);
    await expect(receiptUrl(T1, OTHER_PAYMENT)).resolves.toBeNull();
    held.delete("payments.view");
    await expect(receiptUrl(T1, PAYMENT)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
