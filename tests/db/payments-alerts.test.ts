import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// getPaymentAlerts uses the service client on its own connection, so this file commits a throwaway venue and deletes it
// afterwards. Only the permission check is replaced: the viewer a test sets is the one requirePerm returns.
type Viewer = { userId: string; isPlatformAdmin: boolean; aal: "aal1"; memberships: { tenantId: string; role: string; keys: string[] }[] };
const state = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  requirePerm: async () => state.viewer,
}));

const { getPaymentAlerts } = await import("@/modules/payments");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const one = async <T = string>(sql: string, params: unknown[] = []): Promise<T> => Object.values((await pool.query(sql, params)).rows[0])[0] as T;

const TOTAL = 100_000;
const ADVANCE = 50_000;
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

let tenant = "";
let hall = "";
let slot = "";
let customer = "";
let n = 0;
const ids: Record<string, string> = {};

/** A booking with a quote, walked to `status` by legal moves. `day` is the event date offset from today. */
async function booking(name: string, status: string, over: { day?: number; dueOn?: string | null; payLater?: boolean } = {}) {
  const date = iso(over.day ?? 20 + n);
  const b = await one(
    `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_name, guests)
     values ($1, $2, $3, $4, $5, 'Barat', 200) returning id`,
    [tenant, `MM-2701-${String(++n).padStart(4, "0")}`, customer, date, slot],
  );
  const q = await one(
    "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', $3, $4) returning id",
    [tenant, b, TOTAL, ADVANCE],
  );
  const held = ["awaiting_advance", "hold_expired", "refund_pending"].includes(status);
  await pool.query(
    `update bookings set status = $5, hall_id = $2, current_quote_id = $4,
       during = tstzrange(($3::date + interval '13 hours') at time zone 'UTC', ($3::date + interval '18 hours') at time zone 'UTC'),
       hold_expires_at = case when $5 = 'awaiting_advance' then now() + interval '1 day' end,
       advance_due_on = $6, pay_later = $7
     where id = $1`,
    [b, hall, date, q, held ? "awaiting_advance" : "confirmed", over.dueOn ?? null, over.payLater ?? false],
  );
  if (status === "hold_expired" || status === "refund_pending") await pool.query("update bookings set status = 'hold_expired' where id = $1", [b]);
  if (status === "refund_pending") await pool.query("update bookings set status = 'refund_pending' where id = $1", [b]);
  ids[name] = b;
  return b;
}

const verified = (b: string, amount: number, kind = "payment") =>
  pool.query(
    `insert into payments (tenant_id, booking_id, kind, method, amount_paisa, status, source) values ($1, $2, $3, 'cash', $4, 'verified', 'staff')`,
    [tenant, b, kind, amount],
  );
const receipt = (b: string, status: string, ageDays = 0) =>
  pool.query(
    `insert into payments (tenant_id, booking_id, kind, method, amount_paisa, status, source, reject_reason, created_at)
     values ($1, $2, 'payment', 'bank', 1000, $3, 'customer_receipt', case when $3 = 'rejected' then 'Blurry' end, now() - make_interval(days => $4))`,
    [tenant, b, status, ageDays],
  );
const online = (b: string, ageHours: number) =>
  pool.query(
    `insert into payments (tenant_id, booking_id, kind, method, amount_paisa, status, source, provider, provider_ref, created_at)
     values ($1, $2, 'payment', 'online', 1000, 'pending', 'provider', 'sandbox', $3, now() - make_interval(hours => $4))`,
    [tenant, b, randomUUID(), ageHours],
  );

const viewer = (role: string, extra: Partial<Viewer> = {}): Viewer => ({ userId: randomUUID(), isPlatformAdmin: false, aal: "aal1", memberships: [{ tenantId: tenant, role, keys: [] }], ...extra });
const alertsFor = (v: Viewer) => ((state.viewer = v), getPaymentAlerts(tenant));

beforeAll(async () => {
  const account = await one("insert into accounts (name) values ('Alerts test') returning id");
  tenant = await one("insert into tenants (account_id, slug, name, status, time_zone) values ($1, $2, 'Alerts Hall', 'live', 'UTC') returning id", [account, `al-${randomUUID()}`]);
  await pool.query("insert into tenant_settings (tenant_id) values ($1) on conflict do nothing", [tenant]);
  hall = await one("insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 500) returning id", [tenant]);
  slot = await one("insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  customer = await one("insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);

  // Advance overdue: due yesterday, nothing paid. Not alerts: pays later, advance met, due today, no due date.
  await booking("overdue", "confirmed", { dueOn: iso(-1) });
  await booking("payLater", "confirmed", { dueOn: iso(-1), payLater: true });
  await booking("advanceMet", "confirmed", { dueOn: iso(-1) });
  await verified(ids.advanceMet, ADVANCE);
  await booking("dueToday", "confirmed", { dueOn: iso(0) });
  await booking("noDue", "confirmed");

  // Receipts to review: two pending receipts on one booking count once; a rejected one does not.
  await booking("receipts", "confirmed", { dueOn: iso(5) });
  await receipt(ids.receipts, "pending");
  await receipt(ids.receipts, "pending");
  await receipt(ids.noDue, "rejected");

  // Refund due: refund_pending; cancelled with money still paid; overpaid. Not: cancelled and fully refunded, cancelled keeping the money.
  await booking("refundPending", "refund_pending");
  await booking("cancelledOwing", "confirmed");
  await verified(ids.cancelledOwing, 60_000);
  await pool.query("update bookings set status = 'cancelled', status_reason = 'x', refund_due = true where id = $1", [ids.cancelledOwing]);
  await booking("cancelledRefunded", "confirmed");
  await verified(ids.cancelledRefunded, 60_000);
  await verified(ids.cancelledRefunded, 60_000, "refund");
  await pool.query("update bookings set status = 'cancelled', status_reason = 'x', refund_due = true where id = $1", [ids.cancelledRefunded]);
  await booking("cancelledKept", "confirmed");
  await verified(ids.cancelledKept, 60_000);
  await pool.query("update bookings set status = 'cancelled', status_reason = 'x' where id = $1", [ids.cancelledKept]);
  await booking("overpaid", "confirmed");
  await verified(ids.overpaid, 80_000);
  await verified(ids.overpaid, 30_000);
  await booking("overpaidHeld", "awaiting_advance");
  await verified(ids.overpaidHeld, TOTAL + 1);
  await booking("paidInFull", "confirmed");
  await verified(ids.paidInFull, TOTAL);

  // Online payment stuck: pending over an hour. A fresh one is not.
  await booking("stuck", "confirmed");
  await online(ids.stuck, 2);
  await booking("fresh", "confirmed");
  await online(ids.fresh, 0);

  // Rejected after the event, last 30 days: a past event with a recent rejection. Not: a future event, or an old rejection.
  await booking("pastRejected", "confirmed", { day: -3 });
  await receipt(ids.pastRejected, "rejected", 1);
  await booking("pastOld", "confirmed", { day: -60 });
  await receipt(ids.pastOld, "rejected", 45);
  await booking("futureRejected", "confirmed");
  await receipt(ids.futureRejected, "rejected");
});

afterAll(async () => {
  await pool.query("delete from bookings where tenant_id = $1", [tenant]);
  await pool.query("delete from tenants where id = $1", [tenant]);
  await pool.end();
});

const names = (list: string[]) => list.map((id) => Object.keys(ids).find((k) => ids[k] === id)).sort();

describe("getPaymentAlerts", () => {
  it("lists a booking once for its pending receipts", async () => {
    expect(names((await alertsFor(viewer("manager"))).receiptsToReview)).toEqual(["receipts"]);
  });

  it("lists confirmed bookings past their due date with the advance unmet, unless they pay later", async () => {
    expect(names((await alertsFor(viewer("manager"))).advanceOverdue)).toEqual(["overdue"]);
  });

  it("lists refund_pending, cancelled-and-owing and overpaid bookings, in any status", async () => {
    expect(names((await alertsFor(viewer("manager"))).refundDue)).toEqual(["cancelledOwing", "overpaid", "overpaidHeld", "refundPending"]);
  });

  it("lists pending provider payments older than an hour", async () => {
    expect(names((await alertsFor(viewer("manager"))).onlineStuck)).toEqual(["stuck"]);
  });

  it("shows rejections after the event to the owner and the platform admin only", async () => {
    expect(names((await alertsFor(viewer("owner"))).rejectedAfterEvent)).toEqual(["pastRejected"]);
    expect(names((await alertsFor(viewer("manager", { isPlatformAdmin: true, memberships: [] }))).rejectedAfterEvent)).toEqual(["pastRejected"]);
    expect((await alertsFor(viewer("accounts"))).rejectedAfterEvent).toEqual([]);
    expect((await alertsFor(viewer("manager"))).rejectedAfterEvent).toEqual([]);
  });

  it("is empty for a venue with no payment trouble", async () => {
    const account = await one("insert into accounts (name) values ('Quiet') returning id");
    const quiet = await one("insert into tenants (account_id, slug, name, status) values ($1, $2, 'Quiet', 'live') returning id", [account, `q-${randomUUID()}`]);
    try {
      state.viewer = { ...viewer("owner"), memberships: [{ tenantId: quiet, role: "owner", keys: [] }] };
      expect(await getPaymentAlerts(quiet)).toEqual({ receiptsToReview: [], advanceOverdue: [], refundDue: [], onlineStuck: [], rejectedAfterEvent: [] });
    } finally {
      await pool.query("delete from tenants where id = $1", [quiet]);
    }
  });
});
