import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The race needs two sessions that commit, so this file commits a throwaway venue and deletes it afterwards.
const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const pool = new pg.Pool({ connectionString: URL });
const one = async <T = string>(sql: string, params: unknown[] = []): Promise<T> =>
  Object.values((await pool.query(sql, params)).rows[0])[0] as T;

let tenant = "";
let customer = "";
let eventType = "";
let hall = "";
let n = 0;

const slot = (name: string, start: string, end: string, buffer = 0) =>
  one("insert into slots (tenant_id, name, start_time, end_time, buffer_minutes) values ($1, $2, $3, $4, $5) returning id", [
    tenant,
    name,
    start,
    end,
    buffer,
  ]);

const request = (slotId: string, date = "2027-03-10") =>
  one(
    `insert into bookings (tenant_id, reference, customer_id, event_date, slot_id, event_type_id, event_type_name, guests)
     values ($1, $2, $3, $4, $5, $6, 'Barat', 200) returning id`,
    [tenant, `ZC-2703-${String(++n).padStart(4, "0")}`, customer, date, slotId, eventType],
  );

const SNAPSHOT = { lines: [], subtotalPaisa: 100_000, taxPaisa: 0, calculatedTotalPaisa: 100_000, finalTotalPaisa: 100_000 };
const confirm = (db: pg.Pool | pg.Client, booking: string, actor: string | null = null) =>
  db.query("select public.confirm_booking($1, $2, $3, 100000, 50000, $4)", [booking, hall, SNAPSHOT, actor]);

beforeAll(async () => {
  const account = await one("insert into accounts (name) values ('Confirm test') returning id");
  tenant = await one("insert into tenants (account_id, slug, name, status) values ($1, $2, 'Zc Hall', 'live') returning id", [
    account,
    `zc-${randomUUID()}`,
  ]);
  hall = await one("insert into halls (tenant_id, name, capacity_min, capacity_max) values ($1, 'Main', 0, 500) returning id", [tenant]);
  eventType = await one("insert into event_types (tenant_id, slug, name) values ($1, 'barat', 'Barat') returning id", [tenant]);
  customer = await one("insert into customers (tenant_id, name, phone_e164) values ($1, 'Ali', '+923001234567') returning id", [tenant]);
});

afterAll(async () => {
  // Bookings first: their slot key is on delete restrict.
  await pool.query("delete from bookings where tenant_id = $1", [tenant]);
  await pool.query("delete from tenants where id = $1", [tenant]);
  await pool.end();
});

describe("confirm_booking", () => {
  it("lets exactly one of two parallel confirms of the same hall, date and slot win; the loser leaves no quote", async () => {
    const evening = await slot("Evening race", "18:00", "23:00");
    const [a, b] = [await request(evening), await request(evening)];
    const clients = [new pg.Client({ connectionString: URL }), new pg.Client({ connectionString: URL })];
    await Promise.all(clients.map((c) => c.connect()));
    try {
      const results = await Promise.allSettled([confirm(clients[0], a), confirm(clients[1], b)]);
      const lost = results.filter((r) => r.status === "rejected");
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect((lost[0] as PromiseRejectedResult).reason.code).toBe("23P01");
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    const rows = await pool.query(
      "select b.status, count(q.id)::int as quotes from bookings b left join quotes q on q.booking_id = b.id where b.id = any($1) group by b.id, b.status",
      [[a, b]],
    );
    expect(rows.rows.map((r) => `${r.status}:${r.quotes}`).sort()).toEqual(["confirmed:1", "requested:0"]);
  });

  it("writes the quote, hall, buffered venue-time range and actor in one call", async () => {
    const lunch = await slot("Lunch write", "12:00", "16:00", 30);
    const b = await request(lunch, "2027-04-01");
    const actor = randomUUID();
    await confirm(pool, b, actor);
    const row = (
      await pool.query(
        `select b.status, b.hall_id, b.during = tstzrange('2027-04-01 06:30+00', '2027-04-01 11:30+00') as during_ok,
                q.version, q.total_paisa, q.advance_paisa, q.created_by, q.snapshot ->> 'subtotalPaisa' as subtotal
         from bookings b join quotes q on q.id = b.current_quote_id where b.id = $1`,
        [b],
      )
    ).rows[0];
    expect(row).toEqual({
      status: "confirmed",
      hall_id: hall,
      during_ok: true,
      version: 1,
      total_paisa: 100_000,
      advance_paisa: 50_000,
      created_by: actor,
      subtotal: "100000",
    });
    expect(await one("select actor from booking_status_history where booking_id = $1 and to_status = 'confirmed'", [b])).toBe(actor);
  });

  it("refuses a booking that is not a request, before writing a quote", async () => {
    const s = await slot("Twice", "08:00", "10:00");
    const b = await request(s, "2027-05-01");
    await confirm(pool, b);
    await expect(confirm(pool, b)).rejects.toThrow(/invalid_transition/);
    expect(await one<number>("select count(*)::int from quotes where booking_id = $1", [b])).toBe(1);
  });

  it("does not overlap a dinner past midnight with next-day lunch, both with a 60 minute buffer", async () => {
    const dinner = await slot("Dinner", "19:00", "01:00", 60);
    const lunch = await slot("Lunch", "12:00", "16:00", 60);
    await confirm(pool, await request(dinner, "2027-06-10"));
    await expect(confirm(pool, await request(lunch, "2027-06-11"))).resolves.toBeDefined();
  });

  it("overlaps a dinner past midnight with an after-midnight slot on the next date", async () => {
    const dinner = await slot("Dinner late", "19:00", "01:00", 60);
    const late = await slot("Late night", "00:30", "03:00");
    await confirm(pool, await request(dinner, "2027-07-10"));
    await expect(confirm(pool, await request(late, "2027-07-11"))).rejects.toMatchObject({ code: "23P01" });
  });
});

describe("decline_booking and cancel_booking", () => {
  it("decline a request and cancel a confirmed booking, keeping the reason and actor", async () => {
    const s = await slot("Status", "09:00", "11:00");
    const [declined, confirmed] = [await request(s, "2027-08-01"), await request(s, "2027-08-02")];
    const actor = randomUUID();
    await pool.query("select public.decline_booking($1, 'Date full', $2)", [declined, actor]);
    await confirm(pool, confirmed);
    await pool.query("select public.cancel_booking($1, 'Family change', $2)", [confirmed, actor]);
    const rows = await pool.query("select status, status_reason from bookings where id = any($1) order by event_date", [[declined, confirmed]]);
    expect(rows.rows).toEqual([
      { status: "declined", status_reason: "Date full" },
      { status: "cancelled", status_reason: "Family change" },
    ]);
    expect(await one("select actor from booking_status_history where booking_id = $1 and to_status = 'cancelled'", [confirmed])).toBe(actor);
  });

  it("refuses to decline a confirmed booking", async () => {
    const s = await slot("No decline", "06:00", "07:00");
    const b = await request(s, "2027-08-03");
    await confirm(pool, b);
    await expect(pool.query("select public.decline_booking($1, 'Too late', null)", [b])).rejects.toThrow(/invalid_transition/);
  });
});

describe("staff booking functions access", () => {
  it.each([
    "public.confirm_booking(uuid, uuid, jsonb, int, int, uuid)",
    "public.decline_booking(uuid, text, uuid)",
    "public.cancel_booking(uuid, text, uuid)",
  ])("%s is executable by service_role only", async (fn) => {
    for (const role of ["anon", "authenticated"]) {
      expect(await one<boolean>("select has_function_privilege($1, $2, 'execute')", [role, fn])).toBe(false);
    }
    expect(await one<boolean>("select has_function_privilege('service_role', $1, 'execute')", [fn])).toBe(true);
  });

  it("gives quotes.override to owner and manager by default", async () => {
    const roles = await pool.query(
      "select r.name from role_permissions p join roles r on r.id = p.role_id where p.permission_key = 'quotes.override' and r.tenant_id is null order by r.name",
    );
    expect(roles.rows.map((r) => r.name)).toEqual(["manager", "owner"]);
  });
});

describe("slots used by bookings", () => {
  it("refuses to delete a slot a booking uses", async () => {
    const s = await slot("Used", "05:00", "06:00");
    await request(s, "2027-09-01");
    await expect(pool.query("delete from slots where id = $1", [s])).rejects.toMatchObject({ code: "23503" });
  });
});
