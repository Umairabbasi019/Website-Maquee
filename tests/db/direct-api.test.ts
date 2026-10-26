import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Calls PostgREST as the seeded Manor manager, the way a hand-crafted browser request would. Run `npm run db:seed` first.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
afterAll(() => pool.end());

const tenantId = async (slug: string) => (await pool.query("select id from tenants where slug = $1", [slug])).rows[0].id as string;

describe.skipIf(process.env.SKIP_SEED_TESTS === "1")("direct API writes by a manager", () => {
  let db: SupabaseClient;
  let manor: string;

  beforeAll(async () => {
    db = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await db.auth.signInWithPassword({ email: "manager1@manor.test", password: process.env.SEED_USER_PASSWORD! });
    expect(error, "seed users missing: run `npm run db:seed` first").toBeNull();
    manor = await tenantId("manor");
  });

  /** Expects the update to fail or to change no row. */
  async function refused(patch: Record<string, unknown>) {
    const { data, error } = await db.from("tenant_settings").update(patch).eq("tenant_id", manor).select("tenant_id");
    expect(error !== null || data?.length === 0, JSON.stringify(patch)).toBe(true);
  }

  it("cannot change money rules, theme, sections or the venue name", async () => {
    const { data } = await db.from("tenant_settings").select("identity").eq("tenant_id", manor).single();
    await refused({ money_rules: { taxPercent: 99 } });
    await refused({ theme: {} });
    await refused({ sections: [] });
    await refused({ identity: { ...data?.identity, name: "Hacked" } });
  });

  it("cannot change a package price", async () => {
    const { error } = await db.from("packages").update({ price_per_guest_paisa: 1 }).eq("tenant_id", manor).select("id");
    expect(error).not.toBeNull();
  });

  it("cannot read another venue's settings", async () => {
    const { data, error } = await db.from("tenant_settings").select("tenant_id").eq("tenant_id", await tenantId("demo-hall"));
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
