import { afterAll, describe, expect, it } from "vitest";
import { closeDb, withDb } from "./helpers";

afterAll(closeDb);

async function newTenant(c: Parameters<Parameters<typeof withDb>[0]>[0], status = "setup") {
  const a = await c.query("insert into accounts (name) values ('Acme') returning id");
  const t = await c.query(
    "insert into tenants (account_id, slug, name, status) values ($1, 'schema-test', 'Schema test', $2) returning id",
    [a.rows[0].id, status],
  );
  return t.rows[0].id as string;
}

describe("tenants schema", () => {
  it("rejects an unknown status", () =>
    withDb(async (c) => {
      await expect(newTenant(c, "open")).rejects.toThrow(/status/);
    }));

  it("applies login and manager limit defaults", () =>
    withDb(async (c) => {
      const id = await newTenant(c);
      const r = await c.query("select login_limit, manager_limit from tenants where id = $1", [id]);
      expect(r.rows[0]).toEqual({ login_limit: 5, manager_limit: 2 });
    }));

  it.each([["login_limit", 0], ["login_limit", 51], ["manager_limit", 0], ["manager_limit", 51]])(
    "rejects %s = %i",
    (col, value) =>
      withDb(async (c) => {
        const id = await newTenant(c);
        await expect(c.query(`update tenants set ${col} = $1 where id = $2`, [value, id])).rejects.toThrow(/range/);
      }),
  );

  it("stores hosts lowercase and enforces uniqueness", () =>
    withDb(async (c) => {
      const id = await newTenant(c);
      await c.query("insert into tenant_domains (tenant_id, host) values ($1, 'Manor.PK')", [id]);
      const r = await c.query("select host from tenant_domains where tenant_id = $1", [id]);
      expect(r.rows[0].host).toBe("manor.pk");
      await expect(
        c.query("insert into tenant_domains (tenant_id, host) values ($1, 'manor.pk')", [id]),
      ).rejects.toThrow(/duplicate key/);
    }));

  it("creates a tenant_settings row automatically", () =>
    withDb(async (c) => {
      const id = await newTenant(c);
      const r = await c.query("select 1 from tenant_settings where tenant_id = $1", [id]);
      expect(r.rowCount).toBe(1);
    }));

  it("has RLS enabled on every table", () =>
    withDb(async (c) => {
      const r = await c.query(
        `select relname from pg_class where relnamespace = 'public'::regnamespace
         and relkind = 'r' and not relrowsecurity`,
      );
      expect(r.rows).toEqual([]);
    }));
});
