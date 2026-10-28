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

const ACTOR = randomUUID();
// Every quote here: total 100000, advance 50000.
const SNAPSHOT = { lines: [], subtotalPaisa: 100_000, taxPaisa: 0, calculatedTotalPaisa: 100_000, finalTotalPaisa: 100_000 };
const QUICK = "select public.create_quick_booking($1, $2, $3, $4, now() + interval '60 days', $5, $6, $7)";
const CONFIRM = "select public.confirm_booking($1, $2, $3, 100000, 50000, $4, $5)";
const CANCEL = "select public.cancel_booking($1, 'Family change', $2, $3)";

/** A live venue with two halls and one evening slot; `quick` makes a quick booking there on 2027-01-15. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = await one(c, "insert into tenants (account_id, slug, name, status) values ($1, 'a-venue', 'A', 'live') returning id", [account]);
  const hall = (name: string) =>
    one(c, "insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, $2, 0, 500) returning id", [tenant, name]);
  const [first, second] = [await hall("A"), await hall("B")];
  const slot = await one(c, "insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  let n = 0;
  const quick = async (halls: string[], holdUntil = "2099-01-01", keys = [`key-${++n}`]) => {
    const booking = {
      event_date: "2027-01-15",
      slot_id: slot,
      event_type_id: null,
      event_type_name: "Barat",
      package_id: null,
      package_name: "Gold",
      addon_ids: [],
      addon_names: [],
      guests: 200,
    };
    const candidates = halls.map((h) => ({ hall: h, snapshot: SNAPSHOT, total: 100_000, advance: 50_000 }));
    const r = await one<{ reference: string; held: boolean }>(c, QUICK, [
      tenant,
      { name: "Sara", phone_e164: `+92300100000${n}`, whatsapp_consent: false },
      booking,
      randomUUID(),
      keys,
      JSON.stringify(candidates),
      holdUntil,
    ]);
    const id = await one(c, "select id from bookings where tenant_id = $1 and reference = $2", [tenant, r.reference]);
    return { ...r, id };
  };
  const request = async () => {
    const { id } = await quick([]);
    return id;
  };
  return { tenant, first, second, quick, request };
}

const row = async (c: Client, b: string) =>
  (
    await c.query(
      `select b.status, b.hall_id, b.hold_expires_at, b.during is not null as has_range, q.version, q.total_paisa, q.advance_paisa
       from bookings b left join quotes q on q.id = b.current_quote_id where b.id = $1`,
      [b],
    )
  ).rows[0];

describe("create_quick_booking", () => {
  it("expires an old hold on the slot, holds the new booking, and sends the old one's late payment to refund_pending", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const old = await s.quick([s.first], new Date(Date.now() - 3_600_000).toISOString());
      expect(old.held).toBe(true);
      const fresh = await s.quick([s.first]);
      expect(fresh.held).toBe(true);
      expect(await row(c, old.id)).toMatchObject({ status: "hold_expired", hall_id: s.first });
      expect(await row(c, fresh.id)).toMatchObject({
        status: "awaiting_advance",
        hall_id: s.first,
        hold_expires_at: new Date("2099-01-01T00:00:00Z"),
        has_range: true,
        version: 1,
        total_paisa: 100_000,
        advance_paisa: 50_000,
      });
      const p = await one(c, "select public.record_payment($1, 'payment', 'cash', 50000, 'staff', null, null, null, null, $2)", [old.id, ACTOR]);
      expect(await one(c, "select status from bookings where id = $1", [old.id])).toBe("refund_pending");
      expect(await one(c, "select status from payments where id = $1", [p])).toBe("verified");
    }));

  it("takes the second hall when the first is held", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await s.quick([s.first]);
      const b = await s.quick([s.first, s.second]);
      expect(b.held).toBe(true);
      expect(await row(c, b.id)).toMatchObject({ status: "awaiting_advance", hall_id: s.second, version: 1 });
      expect(await one<number>(c, "select count(*)::int from quotes where booking_id = $1", [b.id])).toBe(1);
    }));

  it("leaves a plain request with no hall or quote when every candidate is taken, or there are none", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await s.quick([s.first]);
      await s.quick([s.second]);
      for (const halls of [[s.first, s.second], []]) {
        const b = await s.quick(halls);
        expect(b.held).toBe(false);
        expect(await row(c, b.id)).toMatchObject({ status: "requested", hall_id: null, hold_expires_at: null, has_range: false, version: null });
        expect(await one<number>(c, "select count(*)::int from quotes where booking_id = $1", [b.id])).toBe(0);
      }
    }));

  it("raises rate_limited like a request", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await c.query("insert into booking_request_hits (tenant_id, key_hash) select $1, 'busy' from generate_series(1, 5)", [s.tenant]);
      await c.query("savepoint limited");
      await expect(s.quick([s.first], "2099-01-01", ["busy"])).rejects.toThrow(/rate_limited/);
      await c.query("rollback to savepoint limited");
      expect(await one<number>(c, "select count(*)::int from bookings where tenant_id = $1", [s.tenant])).toBe(0);
    }));
});

describe("confirm_booking with holds", () => {
  it("expires an old hold on the slot, confirms, and sets the advance due date", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const old = await s.quick([s.first], new Date(Date.now() - 3_600_000).toISOString());
      const b = await s.request();
      await c.query(CONFIRM, [b, s.first, SNAPSHOT, "2027-01-05", ACTOR]);
      expect(await row(c, old.id)).toMatchObject({ status: "hold_expired" });
      expect(await one(c, "select status || ' ' || advance_due_on::text from bookings where id = $1", [b])).toBe("confirmed 2027-01-05");
    }));

  it("refuses a slot held by an unexpired hold", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await s.quick([s.first]);
      await expectReject(c, CONFIRM, [await s.request(), s.first, SNAPSHOT, "2027-01-05", ACTOR], /no_overlap/);
    }));
});

describe("cancel_booking refund choice", () => {
  it("needs a choice when money is paid, and stores it", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const pay = (b: string) => c.query("select public.record_payment($1, 'payment', 'cash', 20000, 'staff', null, null, null, null, $2)", [b, ACTOR]);
      const [refund, keep] = [await s.quick([s.first]), await s.quick([s.second])];
      await pay(refund.id);
      await pay(keep.id);
      await expectReject(c, CANCEL, [refund.id, null, ACTOR], /refund_choice_required/);
      await c.query(CANCEL, [refund.id, true, ACTOR]);
      await c.query(CANCEL, [keep.id, false, ACTOR]);
      const rows = await c.query("select id, status, refund_due from bookings where id = any($1)", [[refund.id, keep.id]]);
      expect(Object.fromEntries(rows.rows.map((r) => [r.id, `${r.status} ${r.refund_due}`]))).toEqual({
        [refund.id]: "cancelled true",
        [keep.id]: "cancelled false",
      });
    }));

  it("cancels with nothing paid as before, ignoring a refund choice", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.quick([s.first]);
      await c.query(CANCEL, [b.id, true, ACTOR]);
      expect(await one(c, "select status || ' ' || refund_due from bookings where id = $1", [b.id])).toBe("cancelled false");
      expect(await one(c, "select actor from booking_status_history where booking_id = $1 and to_status = 'cancelled'", [b.id])).toBe(ACTOR);
    }));

  it("refuses to cancel an expired hold", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const old = await s.quick([s.first], new Date(Date.now() - 3_600_000).toISOString());
      await s.quick([s.first]);
      await expectReject(c, CANCEL, [old.id, null, ACTOR], /invalid_transition/);
    }));
});

describe("hold functions access", () => {
  // confirm_booking and cancel_booking are checked in booking-confirm.test.ts.
  it("create_quick_booking is executable by service_role only", () =>
    withDb(async (c) => {
      const fn = "public.create_quick_booking(uuid, jsonb, jsonb, text, timestamptz, text[], jsonb, timestamptz)";
      for (const role of ["anon", "authenticated"]) {
        expect(await one<boolean>(c, "select has_function_privilege($1, $2, 'execute')", [role, fn])).toBe(false);
      }
      expect(await one<boolean>(c, "select has_function_privilege('service_role', $1, 'execute')", [fn])).toBe(true);
    }));

  it.each(["public.booking_during(uuid)", "public.expire_holds(uuid, tstzrange)"])("%s is not granted to anyone", (fn) =>
    withDb(async (c) => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        expect(await one<boolean>(c, "select has_function_privilege($1, $2, 'execute')", [role, fn])).toBe(false);
      }
    }));

  it("drops the M4 confirm_booking and cancel_booking signatures", () =>
    withDb(async (c) => {
      for (const fn of ["public.confirm_booking(uuid, uuid, jsonb, int, int, uuid)", "public.cancel_booking(uuid, text, uuid)"]) {
        expect(await one(c, "select to_regprocedure($1)::text", [fn])).toBeNull();
      }
    }));
});
