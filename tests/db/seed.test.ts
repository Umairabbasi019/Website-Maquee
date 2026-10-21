import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { SiteContentSchema, TenantSettingsSchema } from "@/modules/tenants";

// Reads committed seed data (supabase/seed.sql + scripts/seed-users.ts), so run `npm run db:seed` first.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
afterAll(() => pool.end());

// A bare `supabase db reset` runs only seed.sql, so the user test fails unless SKIP_SEED_TESTS=1 opts out.
const skipUsers = process.env.SKIP_SEED_TESTS === "1";

const slugs = ["manor", "demo-hall"];

describe("seeded demo tenants", () => {
  it("has two tenants with different accent colours and valid settings", async () => {
    const { rows } = await pool.query(
      `select t.slug, t.status, t.currency, t.time_zone, t.login_limit, t.manager_limit,
              s.identity, s.theme, s.sections, s.money_rules, s.messaging, s.content
       from tenants t join tenant_settings s on s.tenant_id = t.id
       where t.slug = any($1) order by t.slug`,
      [slugs],
    );
    expect(rows.map((r) => [r.slug, r.status])).toEqual([["demo-hall", "setup"], ["manor", "live"]]);
    expect(new Set(rows.map((r) => r.theme.colors.primary)).size).toBe(2);
    for (const r of rows) {
      const parsed = TenantSettingsSchema.safeParse({
        identity: r.identity,
        theme: r.theme,
        sections: r.sections,
        moneyRules: { ...r.money_rules, currency: r.currency, timeZone: r.time_zone },
        messaging: r.messaging,
        limits: { loginLimit: r.login_limit, managerLimit: r.manager_limit },
        content: r.content,
      });
      expect(parsed.success, r.slug).toBe(true);
    }
  });

  it("seeds sample site content for Manor and into the template", async () => {
    const manor = await pool.query(
      `select s.content, s.theme from tenant_settings s join tenants t on t.id = s.tenant_id where t.slug = 'manor'`,
    );
    expect(manor.rows[0].content.sample).toBe(true);
    expect(manor.rows[0].theme.logo).toBe("logo");
    const tpl = await pool.query(`select payload -> 'settings' -> 'content' as content from tenant_templates where name = 'Standard marquee'`);
    const parsed = SiteContentSchema.safeParse(tpl.rows[0].content);
    expect(parsed.success && parsed.data.sample).toBe(true);
  });

  it("has domains, halls and the lunch and dinner slots", async () => {
    const { rows } = await pool.query(
      `select t.slug, d.host,
              (select count(*)::int from halls h where h.tenant_id = t.id) as halls,
              (select string_agg(s.name || ' ' || s.start_time || '-' || s.end_time, ', ' order by s.start_time)
                 from slots s where s.tenant_id = t.id) as slots
       from tenants t join tenant_domains d on d.tenant_id = t.id
       where t.slug = any($1) order by t.slug`,
      [slugs],
    );
    expect(rows.map((r) => [r.slug, r.host])).toEqual([["demo-hall", "demo.localhost"], ["manor", "manor.localhost"]]);
    for (const r of rows) {
      expect(r.halls).toBeGreaterThan(0);
      expect(r.slots).toBe("Lunch 12:00:00-16:00:00, Dinner 19:00:00-23:00:00");
    }
  });

  it("gives each tenant 5 active memberships and makes super a platform admin", async (ctx) => {
    if (skipUsers) ctx.skip("SKIP_SEED_TESTS=1");
    const su = await pool.query("select 1 from auth.users where email = 'super@demo.test'");
    expect(su.rowCount, "seed users missing: run `npm run db:seed` first").toBe(1);
    const { rows } = await pool.query(
      `select t.slug, count(*)::int as n
       from memberships m join tenants t on t.id = m.tenant_id
       where t.slug = any($1) and m.is_active group by t.slug order by t.slug`,
      [slugs],
    );
    expect(rows).toEqual([{ slug: "demo-hall", n: 5 }, { slug: "manor", n: 5 }]);
    const admin = await pool.query(
      `select 1 from platform_admins p join auth.users u on u.id = p.user_id where u.email = 'super@demo.test'`,
    );
    expect(admin.rowCount).toBe(1);
  });
});
