import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake service client: eq and in filters apply to the rows, so a lookup that forgets the tenant filter finds the
// other venue's row and the tests fail. rpc calls are recorded, and an rpc error can be queued.
const T1 = "00000000-0000-4000-8000-00000000000a";
const T2 = "00000000-0000-4000-8000-00000000000b";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BOOKING = id(1);
const OTHER_BOOKING = id(2);
const HALL = id(3);
const SMALL_HALL = id(4);
const OTHER_HALL = id(5);
const PKG = id(6);
const ADDON = id(7);
const USER = id(9);

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const rpcs: { fn: string; args: Row }[] = [];
const audits: Row[] = [];
let rpcError: { code: string; message: string } | null = null;
const held = new Set<string>();

const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const booking = (over: Row = {}): Row => ({
  tenant_id: T1,
  id: BOOKING,
  status: "requested",
  event_date: future,
  guests: 200,
  event_type_id: null,
  package_id: PKG,
  package_name: "Gold",
  addon_ids: [ADDON],
  addon_names: ["Stage"],
  ...over,
});

function reset(bookingOver: Row = {}) {
  Object.assign(tables, {
    tenants: [{ id: T1, time_zone: "Asia/Karachi" }],
    tenant_settings: [{ tenant_id: T1, money_rules: { taxPercent: 0, advancePercent: 50 } }],
    bookings: [booking(bookingOver), booking({ tenant_id: T2, id: OTHER_BOOKING })],
    halls: [
      { tenant_id: T1, id: HALL, name: "Main", capacity_min: 0, capacity_max: 500, is_active: true, hire_price_paisa: null },
      { tenant_id: T1, id: SMALL_HALL, name: "Small", capacity_min: 0, capacity_max: 100, is_active: true, hire_price_paisa: 1_000_000 },
      { tenant_id: T2, id: OTHER_HALL, name: "Other", capacity_min: 0, capacity_max: 900, is_active: true, hire_price_paisa: 0 },
    ],
    // 200 guests x Rs 1,000 + Rs 50,000 flat = Rs 250,000.
    packages: [{ tenant_id: T1, id: PKG, price_per_guest_paisa: 100_000 }],
    addons: [{ tenant_id: T1, id: ADDON, price_paisa: 5_000_000, basis: "flat" }],
    date_prices: [],
  });
}

function query(table: string) {
  let rows = tables[table] ?? [];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
    in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), q),
    lte: () => q,
    gte: () => q,
    returns: () => q,
    single: async () => (rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "not one row" } }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return q;
}

class ForbiddenError extends Error {}
const viewer = { userId: USER, isPlatformAdmin: false, aal: "aal1", memberships: [] };

vi.mock("@/modules/access", () => ({
  ForbiddenError,
  can: (_v: unknown, _t: string, key: string) => held.has(key),
  requirePerm: async (_t: string, key: string) => {
    if (!held.has(key)) throw new ForbiddenError(key);
    return viewer;
  },
  recordAudit: async (a: Row) => void audits.push(a),
  createServerClient: async () => ({ from: query }),
  createServiceClient: () => ({
    from: query,
    rpc: async (fn: string, args: Row) => (rpcs.push({ fn, args }), { data: null, error: rpcError }),
  }),
}));

const { cancelBooking, confirmBooking, declineBooking, previewQuote } = await import("@/modules/booking/server/staff");

beforeEach(() => {
  reset();
  held.clear();
  held.add("bookings.edit");
  rpcs.length = 0;
  audits.length = 0;
  rpcError = null;
});

describe("previewQuote", () => {
  it("prices from live catalogue rows with a null hall hire as 0", async () => {
    const q = await previewQuote(T1, BOOKING, HALL);
    expect(q?.lines.map((l) => [l.label, l.amountPaisa])).toEqual([
      ["Main", 0],
      ["Gold", 20_000_000],
      ["Stage", 5_000_000],
    ]);
    expect(q?.totalPaisa).toBe(25_000_000);
  });

  it("gives null for another venue's booking or hall", async () => {
    await expect(previewQuote(T1, OTHER_BOOKING, HALL)).resolves.toBeNull();
    await expect(previewQuote(T1, BOOKING, OTHER_HALL)).resolves.toBeNull();
  });

  it("leaves out a package the venue removed", async () => {
    reset({ package_id: null });
    expect((await previewQuote(T1, BOOKING, HALL))?.totalPaisa).toBe(5_000_000);
  });
});

describe("confirmBooking", () => {
  it("confirms at the calculated price without quotes.override, recording the actor", async () => {
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL, finalTotalRupees: "250,000" })).resolves.toEqual({ ok: true });
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({
      fn: "confirm_booking",
      args: {
        p_booking: BOOKING,
        p_hall: HALL,
        p_total: 25_000_000,
        p_advance: 12_500_000,
        p_actor: USER,
        p_snapshot: { calculatedTotalPaisa: 25_000_000, finalTotalPaisa: 25_000_000, overrideReason: null, subtotalPaisa: 25_000_000, taxPaisa: 0 },
      },
    });
    expect(audits).toHaveLength(1);
  });

  it("refuses a changed total without quotes.override", async () => {
    const r = await confirmBooking(T1, BOOKING, { hallId: HALL, finalTotalRupees: "200000", reason: "Family discount" });
    expect(r).toEqual({ error: "forbidden" });
    expect(rpcs).toEqual([]);
  });

  it("with quotes.override, stores both totals and recalculates the advance from the final total", async () => {
    held.add("quotes.override");
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL, finalTotalRupees: "200000", reason: "Family discount" })).resolves.toEqual({
      ok: true,
    });
    expect(rpcs[0].args).toMatchObject({
      p_total: 20_000_000,
      p_advance: 10_000_000,
      p_snapshot: { calculatedTotalPaisa: 25_000_000, finalTotalPaisa: 20_000_000, overrideReason: "Family discount" },
    });
    expect(audits[0]).toMatchObject({ reason: "Family discount" });
  });

  it.each(["", "ok", "x".repeat(301)])("refuses an override reason %j", async (reason) => {
    held.add("quotes.override");
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL, finalTotalRupees: "200000", reason })).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it("refuses guests over the hall capacity, and an inactive hall", async () => {
    await expect(confirmBooking(T1, BOOKING, { hallId: SMALL_HALL })).resolves.toEqual({ error: "capacity" });
    tables.halls[0].is_active = false;
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL })).resolves.toEqual({ error: "capacity" });
    expect(rpcs).toEqual([]);
  });

  it("gives notFound for another venue's booking or hall", async () => {
    await expect(confirmBooking(T1, OTHER_BOOKING, { hallId: HALL })).resolves.toEqual({ error: "notFound" });
    await expect(confirmBooking(T1, BOOKING, { hallId: OTHER_HALL })).resolves.toEqual({ error: "notFound" });
  });

  it("refuses a request whose date has passed, and one that is not a request", async () => {
    reset({ event_date: "2020-01-01" });
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL })).resolves.toEqual({ error: "state" });
    reset({ status: "declined" });
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL })).resolves.toEqual({ error: "state" });
    expect(rpcs).toEqual([]);
  });

  it("maps an overlap to slotTaken and a refused transition to state, without an audit", async () => {
    rpcError = { code: "23P01", message: 'conflicting key value violates exclusion constraint "no_overlap"' };
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL })).resolves.toEqual({ error: "slotTaken" });
    rpcError = { code: "P0001", message: "invalid_transition: confirmed to confirmed" };
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL })).resolves.toEqual({ error: "state" });
    expect(audits).toEqual([]);
  });

  it("needs bookings.edit", async () => {
    held.clear();
    await expect(confirmBooking(T1, BOOKING, { hallId: HALL })).rejects.toThrow(ForbiddenError);
  });
});

describe("declineBooking and cancelBooking", () => {
  it.each(["", "  ", "no", "x".repeat(301)])("decline needs a reason of 3 to 300 characters (%j refused)", async (reason) => {
    await expect(declineBooking(T1, BOOKING, reason)).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it("declines with a trimmed reason and the actor, and audits it", async () => {
    await expect(declineBooking(T1, BOOKING, "  Date full  ")).resolves.toEqual({ ok: true });
    expect(rpcs).toEqual([{ fn: "decline_booking", args: { p_booking: BOOKING, p_reason: "Date full", p_actor: USER } }]);
    expect(audits[0]).toMatchObject({ action: "booking.decline", reason: "Date full" });
  });

  it("cancels, maps a refused transition to state, and gives notFound for another venue's booking", async () => {
    await expect(cancelBooking(T1, BOOKING, "Family change")).resolves.toEqual({ ok: true });
    expect(rpcs[0].fn).toBe("cancel_booking");
    rpcError = { code: "P0001", message: "invalid_transition: cancelled to cancelled" };
    await expect(cancelBooking(T1, BOOKING, "Again please")).resolves.toEqual({ error: "state" });
    await expect(cancelBooking(T1, OTHER_BOOKING, "Family change")).resolves.toEqual({ error: "notFound" });
  });
});
