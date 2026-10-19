import { afterAll, describe, expect, it } from "vitest";
import { TenantSettingsSchema } from "@/modules/tenants";
import { asUser, closeDb, createTestUser, withDb } from "./helpers";

afterAll(closeDb);

type Client = Parameters<Parameters<typeof withDb>[0]>[0];

async function setup(c: Client) {
  const admin = await createTestUser(c, "admin@t6.test");
  await c.query("insert into platform_admins (user_id) values ($1)", [admin]);
  const acc = await c.query("insert into accounts (name) values ('Acme') returning id");
  const tpl = await c.query("select id from tenant_templates order by name limit 1");
  return { admin, account: acc.rows[0].id as string, template: tpl.rows[0].id as string };
}

const call = (c: Client, s: { account: string; template: string }, slug = "new-venue") =>
  c.query("select public.create_tenant_from_template($1, $2, 'New Venue', $3) as id", [s.template, s.account, slug]);

describe("create_tenant_from_template", () => {
  it("raises for a non-admin", () =>
    withDb(async (c) => {
      const s = await setup(c);
      const user = await createTestUser(c, "user@t6.test");
      await asUser(c, user, "aal2");
      await expect(call(c, s)).rejects.toThrow(/platform admin only/);
    }));

  it("raises for an admin on an aal1 session", () =>
    withDb(async (c) => {
      const s = await setup(c);
      await asUser(c, s.admin, "aal1");
      await expect(call(c, s)).rejects.toThrow(/platform admin only/);
    }));

  it("rejects a bad slug", () =>
    withDb(async (c) => {
      const s = await setup(c);
      await asUser(c, s.admin, "aal2");
      await expect(call(c, s, "Bad Slug")).rejects.toThrow(/invalid slug/);
    }));

  it("creates tenant, valid settings, features and an audit row for an admin", () =>
    withDb(async (c) => {
      const s = await setup(c);
      await asUser(c, s.admin, "aal2");
      const id = (await call(c, s)).rows[0].id as string;

      const t = await c.query("select slug, name, status from tenants where id = $1", [id]);
      expect(t.rows[0]).toEqual({ slug: "new-venue", name: "New Venue", status: "setup" });

      const st = await c.query("select * from tenant_settings where tenant_id = $1", [id]);
      expect(st.rowCount).toBe(1);
      const r = st.rows[0];
      const parsed = TenantSettingsSchema.parse({
        identity: r.identity, theme: r.theme, sections: r.sections,
        moneyRules: r.money_rules, messaging: r.messaging, limits: r.limits,
      });
      expect(parsed.identity.name).toBe("New Venue");

      const f = await c.query("select count(*)::int n from tenant_features where tenant_id = $1", [id]);
      expect(f.rows[0].n).toBeGreaterThan(0);

      const a = await c.query(
        "select actor_user_id, action from audit_events where tenant_id = $1 and action = 'tenant.create'", [id]);
      expect(a.rows).toEqual([{ actor_user_id: s.admin, action: "tenant.create" }]);
    }));
});
