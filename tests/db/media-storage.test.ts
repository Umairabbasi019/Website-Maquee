import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

// Signs in as the seeded Manor manager, so run `npm run db:seed` first.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const paths: string[] = [];

afterAll(async () => {
  // Only reached with leftovers if a write wrongly succeeded.
  if (paths.length) await admin.storage.from("venue-media").remove(paths);
  await pool.end();
});

const client = () => createClient(url, anonKey, { auth: { persistSession: false } });

async function tryUpload(c: SupabaseClient, who: string) {
  const { rows } = await pool.query("select id from tenants where slug = 'manor'");
  const path = `${rows[0].id}/write-probe-${who}/s.jpg`;
  paths.push(path);
  return c.storage.from("venue-media").upload(path, new Blob(["x"], { type: "image/jpeg" }));
}

describe("venue-media bucket writes", () => {
  it("refuses anon", async () => {
    const { data, error } = await tryUpload(client(), "anon");
    expect(data).toBeNull();
    expect(error?.message).toMatch(/row-level security/);
  });

  it("refuses a Manor manager even with media.manage", async () => {
    const c = client();
    const { error: signInError } = await c.auth.signInWithPassword({
      email: "manager1@manor.test",
      password: process.env.SEED_USER_PASSWORD!,
    });
    expect(signInError, "seed users missing: run `npm run db:seed` first").toBeNull();
    const { data, error } = await tryUpload(c, "manager");
    expect(data).toBeNull();
    expect(error?.message).toMatch(/row-level security/);
  });
});
