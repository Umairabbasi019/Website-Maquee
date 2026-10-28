import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

async function one<T = string>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

async function expectReject(c: Client, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint expect_reject");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint expect_reject");
}

const EVENING = "[2027-01-15 13:00+00, 2027-01-15 18:00+00)";
// Every quote here: total 100000, advance 50000.
const TOTAL = 100_000;
const ADVANCE = 50_000;
const ACTOR = randomUUID();

const RECORD = "select public.record_payment($1, $2, $3, $4, $5, null, null, null, null, $6)";

/** A venue with one hall and slot, and `at(status)` walking a new booking there through legal moves. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = await one(c, "insert into tenants (account_id, slug, name, status) values ($1, 'a-venue', 'A', 'live') returning id", [account]);
  const hall = await one(c, "insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 500) returning id", [tenant]);
  const slot = await one(c, "insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  const customer = await one(c, "insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);
  let n = 0;
  const at = async (status: string) => {
    const b = await one(
      c,
      `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_name, guests)
       values ($1, $2, $3, '2027-01-15', $4, 'Barat', 200) returning id`,
      [tenant, `MM-2701-${String(++n).padStart(4, "0")}`, customer, slot],
    );
    if (status === "requested") return b;
    if (status === "declined") {
      await c.query("update bookings set status = 'declined', status_reason = 'x' where id = $1", [b]);
      return b;
    }
    const q = await one(
      c,
      "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', $3, $4) returning id",
      [tenant, b, TOTAL, ADVANCE],
    );
    const held = status !== "confirmed" && status !== "cancelled";
    await c.query(
      `update bookings set status = $5, hall_id = $2, during = $3, current_quote_id = $4,
         hold_expires_at = case when $5 = 'awaiting_advance' then now() + interval '1 day' end where id = $1`,
      [b, hall, EVENING, q, held ? "awaiting_advance" : "confirmed"],
    );
    if (status === "hold_expired") await c.query("update bookings set status = 'hold_expired' where id = $1", [b]);
    return b;
  };
  return { tenant, hall, at };
}

const status = (c: Client, b: string) => one(c, "select status from bookings where id = $1", [b]);
const paid = (c: Client, b: string) => one<number>(c, "select public.booking_paid($1)", [b]);
const staffPay = (c: Client, b: string, amount: number, kind = "payment") => c.query(RECORD, [b, kind, "cash", amount, "staff", ACTOR]);
const receipt = (c: Client, b: string, amount: number) =>
  one(c, RECORD, [b, "payment", "bank", amount, "customer_receipt", null]);

describe("record_payment amount limits", () => {
  it("takes a payment of 1 to the balance", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      await staffPay(c, b, 30_000);
      for (const amount of [0, TOTAL - 30_000 + 1]) {
        await expectReject(c, RECORD, [b, "payment", "cash", amount, "staff", ACTOR], /amount_out_of_range/);
      }
      await staffPay(c, b, TOTAL - 30_000);
      expect(await paid(c, b)).toBe(TOTAL);
    }));

  it("takes a refund of 1 to the paid amount", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      await staffPay(c, b, 30_000);
      for (const amount of [0, 30_001]) {
        await expectReject(c, RECORD, [b, "refund", "cash", amount, "staff", ACTOR], /amount_out_of_range/);
      }
      await staffPay(c, b, 30_000, "refund");
      expect(await paid(c, b)).toBe(0);
    }));

  it("takes a receipt up to the balance, pending, and verify_payment up to the balance without it", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      await staffPay(c, b, 30_000);
      await expectReject(c, RECORD, [b, "payment", "bank", 70_001, "customer_receipt", null], /amount_out_of_range/);
      const p = await receipt(c, b, 70_000);
      expect(await one(c, "select status from payments where id = $1", [p])).toBe("pending");
      for (const amount of [0, 70_001]) {
        await expectReject(c, "select public.verify_payment($1, $2, $3)", [p, amount, ACTOR], /amount_out_of_range/);
      }
      await c.query("select public.verify_payment($1, $2, $3)", [p, 70_000, ACTOR]);
      const row = (await c.query("select status, verified_by, verified_at is not null as at from payments where id = $1", [p])).rows[0];
      expect(row).toEqual({ status: "verified", verified_by: ACTOR, at: true });
    }));

  it("refuses a staff payment without an actor", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      await expectReject(c, RECORD, [b, "payment", "cash", 100, "staff", null], /invalid_actor/);
    }));

  it("writes a staff payment verified, with who and when", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      const p = await one(c, RECORD, [b, "payment", "cash", 100, "staff", ACTOR]);
      const row = (await c.query("select status, recorded_by, verified_by, verified_at is not null as at from payments where id = $1", [p])).rows[0];
      expect(row).toEqual({ status: "verified", recorded_by: ACTOR, verified_by: ACTOR, at: true });
    }));
});

describe("receipt limits", () => {
  it("refuses a 4th pending receipt", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      for (let i = 0; i < 3; i++) await receipt(c, b, 100);
      await expectReject(c, RECORD, [b, "payment", "bank", 100, "customer_receipt", null], /receipt_limit/);
    }));

  it("refuses an 11th receipt in an hour, rejected ones included", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      const reject = "update payments set status = 'rejected', reject_reason = 'Blurry' where id = $1";
      for (let i = 0; i < 10; i++) await c.query(reject, [await receipt(c, b, 100)]);
      await expectReject(c, RECORD, [b, "payment", "bank", 100, "customer_receipt", null], /receipt_limit/);
      await c.query("update payments set created_at = now() - interval '61 minutes' where booking_id = $1", [b]);
      await receipt(c, b, 100);
    }));
});

describe("payment state", () => {
  it.each(["requested", "declined"])("refuses a payment or refund on a %s booking", (from) =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at(from);
      for (const kind of ["payment", "refund"]) {
        await expectReject(c, RECORD, [b, kind, "cash", 100, "staff", ACTOR], /payment_state/);
      }
    }));

  it("refuses a payment on a cancelled booking but takes a refund", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      await staffPay(c, b, 1000);
      await c.query("update bookings set status = 'cancelled', status_reason = 'x' where id = $1", [b]);
      await expectReject(c, RECORD, [b, "payment", "cash", 100, "staff", ACTOR], /payment_state/);
      await staffPay(c, b, 1000, "refund");
      expect(await paid(c, b)).toBe(0);
    }));

  it("refuses verify_payment on a verified row or a non-receipt, and reject_payment on a non-pending row", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      const staffRow = await one(c, RECORD, [b, "payment", "cash", 100, "staff", ACTOR]);
      await expectReject(c, "select public.verify_payment($1, 100, $2)", [staffRow, ACTOR], /payment_state/);
      await expectReject(c, "select public.reject_payment($1, 'Wrong', $2)", [staffRow, ACTOR], /payment_state/);
      const online = await one(c, "select public.record_payment($1, 'payment', 'online', 100, 'provider', null, null, 'sandbox', $2, null)", [
        b,
        randomUUID(),
      ]);
      await expectReject(c, "select public.verify_payment($1, 100, $2)", [online, ACTOR], /payment_state/);
      await expectReject(c, "select public.reject_payment($1, 'Wrong', $2)", [online, ACTOR], /payment_state/);
    }));

  it("rejects a pending receipt with a 3 to 300 character reason", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      const p = await receipt(c, b, 100);
      for (const reason of ["ab", "x".repeat(301)]) {
        await expectReject(c, "select public.reject_payment($1, $2, $3)", [p, reason, ACTOR], /invalid_reason/);
      }
      await c.query("select public.reject_payment($1, 'Not our account', $2)", [p, ACTOR]);
      const row = (await c.query("select status, reject_reason from payments where id = $1", [p])).rows[0];
      expect(row).toEqual({ status: "rejected", reject_reason: "Not our account" });
    }));
});

describe("settle rule", () => {
  it("confirms awaiting_advance once partial payments cross the advance", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("awaiting_advance");
      await staffPay(c, b, 20_000);
      expect(await status(c, b)).toBe("awaiting_advance");
      await staffPay(c, b, ADVANCE - 20_000);
      expect(await status(c, b)).toBe("confirmed");
    }));

  it("keeps awaiting_advance when a receipt is verified at a lower amount, then a later payment confirms it", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("awaiting_advance");
      const p = await receipt(c, b, 60_000);
      await c.query("select public.verify_payment($1, 40000, $2)", [p, ACTOR]);
      expect(await one<number>(c, "select amount_paisa from payments where id = $1", [p])).toBe(40_000);
      expect(await status(c, b)).toBe("awaiting_advance");
      await staffPay(c, b, 10_000);
      expect(await status(c, b)).toBe("confirmed");
    }));

  it("confirms hold_expired when the slot is still free", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("hold_expired");
      await staffPay(c, b, 20_000);
      expect(await status(c, b)).toBe("hold_expired");
      await staffPay(c, b, ADVANCE - 20_000);
      expect(await status(c, b)).toBe("confirmed");
    }));

  it.each([ADVANCE, 20_000])("sends hold_expired to refund_pending when the slot is taken (payment %i)", (amount) =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("hold_expired");
      await s.at("confirmed");
      await staffPay(c, b, amount);
      expect(await status(c, b)).toBe("refund_pending");
      expect(await paid(c, b)).toBe(amount);
    }));

  it("moves refund_pending to refunded once refunds bring paid to 0", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("hold_expired");
      await s.at("confirmed");
      await staffPay(c, b, ADVANCE);
      await staffPay(c, b, 20_000, "refund");
      expect(await status(c, b)).toBe("refund_pending");
      await staffPay(c, b, ADVANCE - 20_000, "refund");
      expect(await status(c, b)).toBe("refunded");
    }));

  it("clears refund_due on a cancelled booking once refunds bring paid to 0", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      await staffPay(c, b, 30_000);
      await c.query("update bookings set status = 'cancelled', status_reason = 'x', refund_due = true where id = $1", [b]);
      await staffPay(c, b, 10_000, "refund");
      expect(await one<boolean>(c, "select refund_due from bookings where id = $1", [b])).toBe(true);
      await staffPay(c, b, 20_000, "refund");
      expect(await one<boolean>(c, "select refund_due from bookings where id = $1", [b])).toBe(false);
    }));

  it("records p_actor on every status change", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const late = await s.at("hold_expired");
      const held = await s.at("awaiting_advance");
      const p = await receipt(c, held, ADVANCE);
      await c.query("select public.verify_payment($1, $2, $3)", [p, ADVANCE, ACTOR]);
      await staffPay(c, late, ADVANCE);
      await staffPay(c, late, ADVANCE, "refund");
      const rows = await c.query(
        "select booking_id, to_status, actor from booking_status_history where booking_id = any($1) and to_status in ('confirmed', 'refund_pending', 'refunded') order by at, id",
        [[held, late]],
      );
      expect(rows.rows).toEqual([
        { booking_id: held, to_status: "confirmed", actor: ACTOR },
        { booking_id: late, to_status: "refund_pending", actor: ACTOR },
        { booking_id: late, to_status: "refunded", actor: ACTOR },
      ]);
    }));
});

describe("set_payment_terms", () => {
  it("sets the due date and pays later on a confirmed booking only", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.at("confirmed");
      await c.query("select public.set_payment_terms($1, '2027-01-10', true, $2)", [b, ACTOR]);
      const row = (await c.query("select advance_due_on::text as due, pay_later from bookings where id = $1", [b])).rows[0];
      expect(row).toEqual({ due: "2027-01-10", pay_later: true });
      const req = await s.at("requested");
      await expectReject(c, "select public.set_payment_terms($1, '2027-01-10', true, $2)", [req, ACTOR], /payment_state/);
    }));
});

describe("payment functions access", () => {
  it.each([
    "public.record_payment(uuid, text, text, int, text, text, text, text, text, uuid)",
    "public.verify_payment(uuid, int, uuid)",
    "public.reject_payment(uuid, text, uuid)",
    "public.set_payment_terms(uuid, date, boolean, uuid)",
    "public.apply_provider_event(text, text, text, text, int, text, jsonb)",
  ])("%s is executable by service_role only", (fn) =>
    withDb(async (c) => {
      for (const role of ["anon", "authenticated"]) {
        expect(await one<boolean>(c, "select has_function_privilege($1, $2, 'execute')", [role, fn])).toBe(false);
      }
      expect(await one<boolean>(c, "select has_function_privilege('service_role', $1, 'execute')", [fn])).toBe(true);
    }));

  it.each(["public.booking_paid(uuid)", "public.settle_booking(uuid)", "public.lock_booking(uuid)", "public.lock_payment(uuid)"])(
    "%s is not granted to anyone",
    (fn) =>
      withDb(async (c) => {
        for (const role of ["anon", "authenticated", "service_role"]) {
          expect(await one<boolean>(c, "select has_function_privilege($1, $2, 'execute')", [role, fn])).toBe(false);
        }
      }),
  );
});
