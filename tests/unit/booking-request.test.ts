import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicCatalogue } from "@/modules/catalogue";

// A fake service client: eq filters apply to the rows, so a lookup that forgets the tenant filter finds the
// other venue's row and the tests below fail. Every table read and rpc call is recorded.
const T1 = "00000000-0000-4000-8000-00000000000a";
const T2 = "00000000-0000-4000-8000-00000000000b";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SLOT = id(1);
const OTHER_SLOT = id(2);
const EVENT = id(3);
const OTHER_EVENT = id(4);
const PKG = id(5);
const OTHER_PKG = id(6);
const ADDON = id(7);
const OTHER_ADDON = id(8);
const INACTIVE_ADDON = id(9);

type Row = Record<string, unknown>;
const rules = { taxPercent: 0, advancePercent: 50, holdHours: 48, instantBooking: false, paymentMethods: [], showPriceEstimate: true };
const tables: Record<string, Row[]> = {};
const reads: string[] = [];
const rpcs: { fn: string; args: Row }[] = [];

function resetTables() {
  Object.assign(tables, {
    tenants: [
      { id: T1, name: "Venue One", slug: "venue-one", time_zone: "Asia/Karachi", status: "live" },
      { id: T2, name: "Venue Two", slug: "venue-two", time_zone: "Asia/Karachi", status: "live" },
    ],
    tenant_settings: [
      { tenant_id: T1, money_rules: rules },
      { tenant_id: T2, money_rules: rules },
    ],
    slots: [
      { tenant_id: T1, id: SLOT, name: "Evening" },
      { tenant_id: T2, id: OTHER_SLOT, name: "Evening" },
    ],
    halls: [
      { tenant_id: T1, capacity_max: 500, is_active: true },
      { tenant_id: T1, capacity_max: 900, is_active: false },
      { tenant_id: T2, capacity_max: 2000, is_active: true },
    ],
    date_prices: [],
  });
}

function query(table: string) {
  reads.push(table);
  let rows = tables[table] ?? [];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
    lte: () => q,
    gte: () => q,
    returns: () => q,
    single: async () => (rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "not one row" } }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return q;
}

let rpcResult: { data: unknown; error: { code?: string; message: string } | null } = { data: "VE-2610-0001", error: null };

vi.mock("@/modules/access", () => ({
  createServiceClient: () => ({
    from: query,
    rpc: async (fn: string, args: Row) => (rpcs.push({ fn, args }), rpcResult),
  }),
}));

const event = (eid: string, pid: string) => ({
  id: eid,
  slug: "barat",
  name: "Barat",
  description: "",
  mediaKey: null,
  packages: [{ id: pid, name: "Gold", pricePerGuestPaisa: 400000, minGuests: 100, items: ["Food"], featured: false }],
});
const catalogues: Record<string, PublicCatalogue> = {
  [T1]: {
    events: [event(EVENT, PKG)],
    offers: [],
    addons: [{ id: ADDON, name: "Lights", pricePaisa: 2500000, basis: "flat" }],
    stageThemes: [],
    hasSample: false,
  },
  [T2]: {
    events: [event(OTHER_EVENT, OTHER_PKG)],
    offers: [],
    addons: [{ id: OTHER_ADDON, name: "Lights", pricePaisa: 100, basis: "flat" }],
    stageThemes: [],
    hasSample: false,
  },
};
vi.mock("@/modules/catalogue", () => ({ getPublicCatalogue: async (tenantId: string) => catalogues[tenantId] }));

const { normalisePkMobile, BookingRequestSchema } = await import("@/modules/booking/request");
const { createBookingRequest, estimateFor } = await import("@/modules/booking/server/request");

const valid = {
  date: "2026-12-15",
  slotId: SLOT,
  eventTypeId: EVENT,
  guests: 300,
  packageId: PKG,
  addonIds: [ADDON],
  name: "Ali Khan",
  phone: "0300 1234567",
  whatsappConsent: true,
  website: "",
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  resetTables();
  reads.length = 0;
  rpcs.length = 0;
  rpcResult = { data: "VE-2610-0001", error: null };
});

describe("normalisePkMobile", () => {
  it.each(["0300 1234567", "+92 300 1234567", "92-300-1234567"])("accepts %s as +923001234567", (raw) => {
    expect(normalisePkMobile(raw)).toBe("+923001234567");
  });

  it.each(["12345", "042 35761234", ""])("refuses %j", (raw) => {
    expect(normalisePkMobile(raw)).toBeNull();
  });
});

describe("BookingRequestSchema", () => {
  it("normalises the phone and refuses a filled honeypot", () => {
    expect(BookingRequestSchema.parse(valid).phone).toBe("+923001234567");
    expect(BookingRequestSchema.safeParse({ ...valid, website: "http://spam" }).success).toBe(false);
  });

  it("refuses a non-integer or zero guest count and a long name", () => {
    expect(BookingRequestSchema.safeParse({ ...valid, guests: 2.5 }).success).toBe(false);
    expect(BookingRequestSchema.safeParse({ ...valid, guests: 0 }).success).toBe(false);
    expect(BookingRequestSchema.safeParse({ ...valid, name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("createBookingRequest", () => {
  it("refuses a filled honeypot without writing", async () => {
    await expect(createBookingRequest(T1, { ...valid, website: "x" }, "ip")).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it.each(["2026-10-26", "2028-04-28"])("refuses the date %s (before today or past 18 months)", async (date) => {
    await expect(createBookingRequest(T1, { ...valid, date }, "ip")).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it("accepts today and the last day 18 months out", async () => {
    for (const date of ["2026-10-27", "2028-04-27"]) {
      await expect(createBookingRequest(T1, { ...valid, date }, "ip")).resolves.toMatchObject({ ok: true });
    }
  });

  it("refuses guests above the largest active hall capacity", async () => {
    await expect(createBookingRequest(T1, { ...valid, guests: 501 }, "ip")).resolves.toEqual({ error: "invalid" });
    await expect(createBookingRequest(T1, { ...valid, guests: 500 }, "ip")).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ["slot", { slotId: OTHER_SLOT }],
    ["event type", { eventTypeId: OTHER_EVENT }],
    ["package", { packageId: OTHER_PKG }],
    ["add-on", { addonIds: [OTHER_ADDON] }],
    ["inactive add-on", { addonIds: [INACTIVE_ADDON] }],
  ])("refuses another venue's or an inactive %s", async (_what, change) => {
    await expect(createBookingRequest(T1, { ...valid, ...change }, "ip")).resolves.toEqual({ error: "invalid" });
    expect(rpcs).toEqual([]);
  });

  it("refuses a package of a different event type of the same venue", async () => {
    catalogues[T1].events.push(event(id(10), id(11)));
    try {
      await expect(createBookingRequest(T1, { ...valid, packageId: id(11) }, "ip")).resolves.toEqual({ error: "invalid" });
    } finally {
      catalogues[T1].events.pop();
    }
  });

  it("sends the server's own names, the hashed keys and a hashed token", async () => {
    const r = await createBookingRequest(T1, valid, "ip-hash");
    expect(r).toEqual({ ok: true, reference: "VE-2610-0001", token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    const { fn, args } = rpcs[0];
    expect(fn).toBe("create_booking_request");
    expect(args).toMatchObject({
      p_tenant: T1,
      p_customer: { name: "Ali Khan", phone_e164: "+923001234567", whatsapp_consent: true },
      p_booking: { event_date: "2026-12-15", slot_id: SLOT, event_type_name: "Barat", package_name: "Gold", addon_ids: [ADDON], guests: 300 },
      p_expires: "2027-02-13T00:00:00.000Z",
    });
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_key_hashes).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/), "ip-hash"]);
  });

  it("maps the rate limit to limited", async () => {
    rpcResult = { data: null, error: { code: "P0001", message: "rate_limited" } };
    await expect(createBookingRequest(T1, valid, "ip")).resolves.toEqual({ error: "limited" });
  });

  it("gives the same result shape for a date with a confirmed booking, and never reads bookings", async () => {
    tables.bookings = [{ tenant_id: T1, event_date: "2026-12-15", status: "confirmed" }];
    const taken = await createBookingRequest(T1, valid, "ip");
    delete tables.bookings;
    const free = await createBookingRequest(T1, { ...valid, date: "2026-12-16" }, "ip");
    expect(Object.keys(taken).sort()).toEqual(Object.keys(free).sort());
    expect(taken).toMatchObject({ ok: true });
    expect(reads).not.toContain("bookings");
  });
});

describe("estimateFor", () => {
  const choice = { date: "2026-12-15", eventTypeId: EVENT, guests: 300, packageId: PKG, addonIds: [ADDON] };

  it("prices the package and add-ons without hall hire", async () => {
    const q = await estimateFor(T1, choice);
    expect(q?.lines.map((l) => l.kind)).toEqual(["package", "addon"]);
    expect(q?.totalPaisa).toBe(300 * 400000 + 2500000);
  });

  it("is null with no package, the setting off, or another venue's package", async () => {
    await expect(estimateFor(T1, { ...choice, packageId: undefined })).resolves.toBeNull();
    await expect(estimateFor(T1, { ...choice, packageId: OTHER_PKG })).resolves.toBeNull();
    tables.tenant_settings[0].money_rules = { ...rules, showPriceEstimate: false };
    await expect(estimateFor(T1, choice)).resolves.toBeNull();
  });
});
