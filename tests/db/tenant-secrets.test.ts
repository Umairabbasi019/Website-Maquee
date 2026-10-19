import { afterAll, describe, expect, it } from "vitest";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

async function seedTenant(c: Parameters<Parameters<typeof withDb>[0]>[0]) {
  const { rows } = await c.query(
    "insert into accounts (name) values ('A') returning id",
  );
  const t = await c.query(
    "insert into tenants (account_id, name, slug, status) values ($1, 'T', 'secret-t', 'live') returning id",
    [rows[0].id],
  );
  return t.rows[0].id as string;
}

describe("tenant_secrets lockdown", () => {
  it("denies authenticated platform admin at aal2 on select and insert", async () => {
    await withDb(async (c) => {
      const admin = await createTestUser(c, "sec-admin@test.local");
      await c.query("insert into platform_admins (user_id) values ($1)", [admin]);
      const tenant = await seedTenant(c);
      await asUser(c, admin, "aal2");
      await c.query("savepoint s1");
      await expect(c.query("select * from tenant_secrets")).rejects.toThrow(/permission denied/);
      await c.query("rollback to savepoint s1");
      await expect(
        c.query("insert into tenant_secrets (tenant_id, kind, ciphertext) values ($1, 'email', 'x')", [tenant]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("denies anon", async () => {
    await withDb(async (c) => {
      await asUser(c, null);
      await expect(c.query("select * from tenant_secrets")).rejects.toThrow(/permission denied/);
    });
  });

  it("allows service_role to upsert one row per tenant+kind", async () => {
    await withDb(async (c) => {
      const tenant = await seedTenant(c);
      await c.query("set local role service_role");
      const sql =
        "insert into tenant_secrets (tenant_id, kind, ciphertext) values ($1, 'email', $2) on conflict (tenant_id, kind) do update set ciphertext = excluded.ciphertext";
      await c.query(sql, [tenant, "one"]);
      await c.query(sql, [tenant, "two"]);
      const { rows } = await c.query("select ciphertext from tenant_secrets where tenant_id = $1", [tenant]);
      expect(rows).toEqual([{ ciphertext: "two" }]);
    });
  });
});
