import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

async function one<T = string>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

async function newTenant(c: Client, loginLimit: number, managerLimit: number) {
  const account = await one(c, "insert into accounts (name) values ('Acme') returning id");
  return one(
    c,
    `insert into tenants (account_id, slug, name, login_limit, manager_limit)
     values ($1, $2, $2, $3, $4) returning id`,
    [account, `t-${randomUUID()}`, loginLimit, managerLimit],
  );
}

const roleId = (c: Client, name: string) =>
  one(c, "select id from roles where tenant_id is null and name = $1", [name]);

async function addMember(c: Client, tenant: string, roleName: string, active = true) {
  const user = await createTestUser(c, `${randomUUID()}@test.local`);
  const id = await one(
    c,
    "insert into memberships (tenant_id, user_id, role_id, is_active) values ($1, $2, $3, $4) returning id",
    [tenant, user, await roleId(c, roleName), active],
  );
  return { id, user };
}

async function expectReject(c: Client, sql: string, params: unknown[], message: string) {
  await c.query("savepoint expect_reject");
  await expect(c.query(sql, params)).rejects.toThrow(message);
  await c.query("rollback to savepoint expect_reject");
}

const ADD = "insert into memberships (tenant_id, user_id, role_id) values ($1, $2, $3)";

describe("login limits", () => {
  it("rejects a third active manager", () =>
    withDb(async (c) => {
      const t = await newTenant(c, 5, 2);
      await addMember(c, t, "manager");
      await addMember(c, t, "manager");
      const user = await createTestUser(c, "m3@test.local");
      await expectReject(c, ADD, [t, user, await roleId(c, "manager")], "manager_limit_reached");
      await c.query(ADD, [t, user, await roleId(c, "staff")]);
    }));

  it("rejects the sixth active member", () =>
    withDb(async (c) => {
      const t = await newTenant(c, 5, 2);
      for (let i = 0; i < 5; i++) await addMember(c, t, "staff");
      const user = await createTestUser(c, "s6@test.local");
      await expectReject(c, ADD, [t, user, await roleId(c, "staff")], "login_limit_reached");
    }));

  it("does not count inactive members, and counts reactivation", () =>
    withDb(async (c) => {
      const t = await newTenant(c, 2, 2);
      const first = await addMember(c, t, "staff");
      await addMember(c, t, "staff");
      const gone = await addMember(c, t, "staff", false);
      await expectReject(c, "update memberships set is_active = true where id = $1", [gone.id], "login_limit_reached");
      await c.query("update memberships set is_active = false where id = $1", [first.id]);
      await c.query("update memberships set is_active = true where id = $1", [gone.id]);
    }));

  it("rejects reactivating a manager over the manager limit", () =>
    withDb(async (c) => {
      const t = await newTenant(c, 5, 1);
      await addMember(c, t, "manager");
      const off = await addMember(c, t, "manager", false);
      await expectReject(c, "update memberships set is_active = true where id = $1", [off.id], "manager_limit_reached");
    }));

  it("rejects promoting an active member to manager over the limit", () =>
    withDb(async (c) => {
      const t = await newTenant(c, 5, 1);
      await addMember(c, t, "manager");
      const s = await addMember(c, t, "staff");
      await expectReject(
        c,
        "update memberships set role_id = $2 where id = $1",
        [s.id, await roleId(c, "manager")],
        "manager_limit_reached",
      );
    }));

  it("allows deactivating and unrelated changes while a tenant is over its lowered limit", () =>
    withDb(async (c) => {
      const t = await newTenant(c, 5, 2);
      const a = await addMember(c, t, "manager");
      await addMember(c, t, "manager");
      await addMember(c, t, "staff");
      await c.query("update tenants set login_limit = 1, manager_limit = 1 where id = $1", [t]);
      await c.query("update memberships set deactivated_at = null where id = $1", [a.id]);
      await c.query("update memberships set role_id = $2 where id = $1", [a.id, await roleId(c, "manager")]);
      await c.query("update memberships set is_active = false, deactivated_at = now() where id = $1", [a.id]);
    }));
});

describe("login limits under concurrency", () => {
  it("lets exactly one of two simultaneous last-seat inserts commit", async () => {
    const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const setup = new pg.Client({ connectionString: url });
    const [a, b] = [new pg.Client({ connectionString: url }), new pg.Client({ connectionString: url })];
    await Promise.all([setup.connect(), a.connect(), b.connect()]);
    const ids = { account: randomUUID(), tenant: randomUUID(), users: [randomUUID(), randomUUID(), randomUUID()] };
    try {
      await setup.query("insert into accounts (id, name) values ($1, 'Race')", [ids.account]);
      await setup.query(
        "insert into tenants (id, account_id, slug, name, login_limit) values ($1, $2, $3, 'Race', 2)",
        [ids.tenant, ids.account, `race-${ids.tenant}`],
      );
      for (const u of ids.users) {
        await setup.query("insert into auth.users (id, email) values ($1, $2)", [u, `${u}@test.local`]);
      }
      const staff = (await setup.query("select id from roles where tenant_id is null and name = 'staff'")).rows[0].id;
      await setup.query(ADD, [ids.tenant, ids.users[0], staff]);

      await a.query("begin");
      await b.query("begin");
      await a.query(ADD, [ids.tenant, ids.users[1], staff]); // takes the tenant row lock
      const bInsert = b.query(ADD, [ids.tenant, ids.users[2], staff]).then(
        () => "ok",
        (e: Error) => e.message,
      );
      // b must be waiting on a's lock; a commit releases it.
      await new Promise((r) => setTimeout(r, 500));
      await a.query("commit");
      const bResult = await bInsert;
      await b.query(bResult === "ok" ? "commit" : "rollback");

      expect(bResult).toContain("login_limit_reached");
      const n = await setup.query("select count(*)::int as n from memberships where tenant_id = $1", [ids.tenant]);
      expect(n.rows[0].n).toBe(2);
    } finally {
      await a.query("rollback").catch(() => {});
      await b.query("rollback").catch(() => {});
      await setup.query("delete from tenants where id = $1", [ids.tenant]);
      await setup.query("delete from accounts where id = $1", [ids.account]);
      await setup.query("delete from auth.users where id = any($1)", [ids.users]);
      await Promise.all([setup.end(), a.end(), b.end()]);
    }
  });
});
