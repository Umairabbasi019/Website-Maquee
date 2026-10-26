import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrimaryHost, resolveTenantByHost } from "@/modules/tenants";

// resolveTenantByHost goes through PostgREST, so rows must be committed (not rolled back).
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const tag = randomUUID().slice(0, 8);
const slug = `t5-${tag}`;
const verifiedHost = `verified-${tag}.example`;
const unverifiedHost = `unverified-${tag}.example`;
let account: string;
let tenantId: string;

beforeAll(async () => {
  account = (await pool.query("insert into accounts (name) values ('t5') returning id")).rows[0].id;
  tenantId = (
    await pool.query("insert into tenants (account_id, slug, name, status) values ($1, $2, 't5', 'live') returning id", [
      account,
      slug,
    ])
  ).rows[0].id;
  await pool.query("insert into tenant_domains (tenant_id, host, verified_at) values ($1, $2, now()), ($1, $3, null)", [
    tenantId,
    verifiedHost,
    unverifiedHost,
  ]);
});

afterAll(async () => {
  await pool.query("delete from tenants where id = $1", [tenantId]);
  await pool.query("delete from accounts where id = $1", [account]);
  await pool.end();
});

const platformRoot = () => (process.env.PLATFORM_HOST ?? "localhost:3000").split(":")[0];

describe("resolveTenantByHost", () => {
  it("returns null for an unknown host", async () => {
    expect(await resolveTenantByHost("unknown.example")).toBeNull();
  });

  it("resolves <slug>.<PLATFORM_HOST>, ignoring case and port", async () => {
    const r = await resolveTenantByHost(`${slug.toUpperCase()}.${platformRoot()}:3000`);
    expect(r).toEqual({ tenantId, status: "live" });
  });

  it("resolves a verified custom domain, with or without www", async () => {
    expect(await resolveTenantByHost(verifiedHost)).toEqual({ tenantId, status: "live" });
    expect(await resolveTenantByHost(`www.${verifiedHost}`)).toEqual({ tenantId, status: "live" });
  });

  it("does not resolve an unverified custom domain", async () => {
    expect(await resolveTenantByHost(unverifiedHost)).toBeNull();
  });

  it("gives the primary domain, or null before one is set", async () => {
    expect(await getPrimaryHost(tenantId)).toBeNull();
    await pool.query("update tenant_domains set is_primary = true where host = $1", [verifiedHost]);
    expect(await getPrimaryHost(tenantId)).toBe(verifiedHost);
  });

  it("does not treat the platform host itself or nested labels as a slug", async () => {
    expect(await resolveTenantByHost(platformRoot())).toBeNull();
    expect(await resolveTenantByHost(`x.${slug}.${platformRoot()}`)).toBeNull();
  });
});
