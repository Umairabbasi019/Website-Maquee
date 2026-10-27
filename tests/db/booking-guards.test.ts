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

/** A venue with one hall, slot, event type and customer, written as the server. */
async function seed(c: Client) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  const tenant = await one(c, "insert into tenants (account_id, slug, name, status) values ($1, 'a-venue', 'A', 'live') returning id", [account]);
  const hall = await one(c, "insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 500) returning id", [tenant]);
  const slot = await one(c, "insert into slots (tenant_id, name, start_time, end_time) values ($1, 'Evening', '18:00', '23:00') returning id", [tenant]);
  const eventType = await one(c, "insert into event_types (tenant_id, slug, name) values ($1, 'barat', 'Barat') returning id", [tenant]);
  const customer = await one(c, "insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);
  let n = 0;
  const request = async () =>
    one(
      c,
      `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_id, guests)
       values ($1, $2, $3, '2027-01-15', $4, $5, 200) returning id`,
      [tenant, `MM-2701-${String(++n).padStart(4, "0")}`, customer, slot, eventType],
    );
  const quote = async (booking: string, version = 1) =>
    one(
      c,
      "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, $3, '{}', 100000, 50000) returning id",
      [tenant, booking, version],
    );
  const confirm = (booking: string, quoteId: string) =>
    c.query("update bookings set status = 'confirmed', hall_id = $2, during = $3, current_quote_id = $4 where id = $1", [
      booking,
      hall,
      EVENING,
      quoteId,
    ]);
  return { account, tenant, hall, slot, eventType, customer, request, quote, confirm };
}

describe("booking transitions", () => {
  it("allows requested to confirmed, then confirmed to cancelled with a reason", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await s.confirm(b, await s.quote(b));
      await c.query("update bookings set status = 'cancelled', status_reason = 'Family change' where id = $1", [b]);
      expect(await one(c, "select status from bookings where id = $1", [b])).toBe("cancelled");
    }));

  it("refuses declined to confirmed", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      const q = await s.quote(b);
      await c.query("update bookings set status = 'declined', status_reason = 'Date full' where id = $1", [b]);
      await expectReject(
        c,
        "update bookings set status = 'confirmed', hall_id = $2, during = $3, current_quote_id = $4 where id = $1",
        [b, s.hall, EVENING, q],
        /invalid_transition/,
      );
    }));

  it.each([
    ["confirmed", "requested"],
    ["cancelled", "requested"],
  ])("refuses %s to %s", (from, to) =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await s.confirm(b, await s.quote(b));
      if (from === "cancelled") await c.query("update bookings set status = 'cancelled', status_reason = 'x' where id = $1", [b]);
      await expectReject(c, "update bookings set status = $2 where id = $1", [b, to], /invalid_transition/);
    }));

  it("refuses a confirm without a hall, time or quote", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await expectReject(c, "update bookings set status = 'confirmed' where id = $1", [b], /check/);
    }));

  it("refuses a decline or cancel without a reason", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await expectReject(c, "update bookings set status = 'declined' where id = $1", [b], /check/);
    }));

  it.each([
    ["event_date", "'2027-02-01'"],
    ["guests", "300"],
    ["hall_id", "null"],
    ["addon_ids", `'{${randomUUID()}}'`],
  ])("refuses a %s change on a confirmed booking", (column, value) =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await s.confirm(b, await s.quote(b));
      await expectReject(c, `update bookings set ${column} = ${value} where id = $1`, [b], /booking_locked/);
    }));

  it("lets a request change its details before confirming", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await c.query("update bookings set guests = 250, event_date = '2027-02-01' where id = $1", [b]);
    }));
});

describe("booking status history", () => {
  it("records the first status and each change with the actor and reason", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      const actor = randomUUID();
      await c.query("select set_config('app.actor', $1, true)", [actor]);
      await c.query("update bookings set status = 'declined', status_reason = 'Date full' where id = $1", [b]);
      const rows = await c.query(
        "select tenant_id, from_status, to_status, actor, reason from booking_status_history where booking_id = $1 order by at, id",
        [b],
      );
      expect(rows.rows).toEqual([
        { tenant_id: s.tenant, from_status: null, to_status: "requested", actor: null, reason: null },
        { tenant_id: s.tenant, from_status: "requested", to_status: "declined", actor, reason: "Date full" },
      ]);
    }));

  it("writes nothing when the status stays the same", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await c.query("update bookings set guests = 250 where id = $1", [b]);
      expect(Number(await one(c, "select count(*) from booking_status_history where booking_id = $1", [b]))).toBe(1);
    }));
});

describe("quotes", () => {
  it("refuses update and delete", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      const q = await s.quote(b);
      await expectReject(c, "update quotes set total_paisa = 1 where id = $1", [q], /quote_immutable/);
      await expectReject(c, "delete from quotes where id = $1", [q], /quote_immutable/);
    }));

  it("keeps versions unique per booking", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await s.quote(b, 1);
      await s.quote(b, 2);
      await expectReject(
        c,
        "insert into quotes (tenant_id, booking_id, version, snapshot, total_paisa, advance_paisa) values ($1, $2, 1, '{}', 1, 1)",
        [s.tenant, b],
        /duplicate key/,
      );
    }));

  it("refuses another booking's quote as the current quote", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b1 = await s.request();
      const b2 = await s.request();
      const q2 = await s.quote(b2);
      await expectReject(c, "update bookings set current_quote_id = $2 where id = $1", [b1, q2], /foreign key/);
    }));
});

describe("bookings constraints", () => {
  it("blocks two confirmed bookings of the same hall at overlapping times", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b1 = await s.request();
      const b2 = await s.request();
      await s.confirm(b1, await s.quote(b1));
      const q2 = await s.quote(b2);
      await c.query("savepoint overlap");
      await expect(s.confirm(b2, q2)).rejects.toThrow(/no_overlap/);
      await c.query("rollback to savepoint overlap");
      await c.query("update bookings set status = 'cancelled', status_reason = 'x' where id = $1", [b1]);
      await s.confirm(b2, q2);
    }));

  it("keeps references unique per venue", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      const ref = await one(c, "select reference from bookings where id = $1", [b]);
      await expectReject(
        c,
        `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_id, guests)
         values ($1, $2, $3, '2027-01-15', $4, $5, 10)`,
        [s.tenant, ref, s.customer, s.slot, s.eventType],
        /duplicate key/,
      );
    }));

  it("refuses zero guests and another venue's slot", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const other = await one(c, "insert into tenants (account_id, slug, name, status) values ($1, 'b-venue', 'B', 'live') returning id", [s.account]);
      const sql = `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_id, guests)
         values ($1, 'X-1', $2, '2027-01-15', $3, $4, $5)`;
      await expectReject(c, sql, [s.tenant, s.customer, s.slot, s.eventType, 0], /check/);
      await expectReject(c, sql, [other, s.customer, s.slot, s.eventType, 10], /foreign key/);
    }));

  it("refuses deleting a slot that bookings use", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await s.request();
      await expectReject(c, "delete from slots where id = $1", [s.slot], /foreign key/);
    }));

  it("keeps one customer per phone per venue", () =>
    withDb(async (c) => {
      const s = await seed(c);
      await expectReject(
        c,
        "insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali 2', '+923001234567')",
        [s.tenant],
        /duplicate key/,
      );
    }));

  it("deleting the venue deletes its bookings, quotes and history", () =>
    withDb(async (c) => {
      const s = await seed(c);
      const b = await s.request();
      await s.confirm(b, await s.quote(b));
      await c.query("delete from tenants where id = $1", [s.tenant]);
      for (const table of ["bookings", "quotes", "booking_status_history", "customers"]) {
        expect(Number(await one(c, `select count(*) from ${table} where tenant_id = $1`, [s.tenant]))).toBe(0);
      }
    }));
});
