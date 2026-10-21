import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { generate } from "otplib";
import { assertLocalSupabaseUrl } from "./local-guard";

process.loadEnvFile(".env.local");

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
assertLocalSupabaseUrl(url);
const password = env("SEED_USER_PASSWORD");
const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const SUPER = "super@demo.test";
const TENANTS = ["manor", "demo-hall"];
// Mailbox prefix -> built-in role name.
const STAFF: Record<string, string> = {
  owner: "owner",
  manager1: "manager",
  manager2: "manager",
  accounts: "accounts",
  staff: "staff",
};

// Throws on error; the return type drops the failure variant, so callers see non-null data.
function check<T extends { data: unknown; error: { message: string } | null }>(
  r: T,
  what: string,
): Exclude<T, { error: { message: string } }>["data"] {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

// shortcut: one listUsers page (200) is enough for the 11 demo users; page through if the seed grows.
async function ensureUser(email: string, existing: Map<string, string>): Promise<string> {
  const known = existing.get(email);
  if (known) return known;
  const { user } = check(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `create ${email}`);
  if (!user) throw new Error(`create ${email}: no user returned`);
  return user.id;
}

async function main() {
  const listed = check(await admin.auth.admin.listUsers({ perPage: 200 }), "list users");
  const existing = new Map(listed.users.map((u) => [u.email ?? "", u.id]));

  const superId = await ensureUser(SUPER, existing);
  check(await admin.from("platform_admins").upsert({ user_id: superId }), "platform_admins");

  const roles = new Map(
    check(await admin.from("roles").select("id, name").is("tenant_id", null), "roles").map((r) => [r.name, r.id]),
  );
  const tenants = check(await admin.from("tenants").select("id, slug").in("slug", TENANTS), "tenants");
  if (tenants.length !== TENANTS.length) throw new Error("demo tenants missing; run `npm run db:seed`");

  for (const t of tenants) {
    for (const [prefix, roleName] of Object.entries(STAFF)) {
      const userId = await ensureUser(`${prefix}@${t.slug}.test`, existing);
      const roleId = roles.get(roleName);
      if (!roleId) throw new Error(`built-in role ${roleName} missing`);
      // Insert only when missing: an upsert on an existing row still trips the login-limit trigger.
      const found = await admin.from("memberships").select("id").eq("tenant_id", t.id).eq("user_id", userId);
      if (check(found, `membership lookup ${prefix}@${t.slug}.test`).length === 0) {
        check(
          await admin.from("memberships").insert({ tenant_id: t.id, user_id: userId, role_id: roleId }).select("id"),
          `membership ${prefix}@${t.slug}.test`,
        );
      }
    }
  }

  // Re-runs drop every existing factor and enroll a fresh one, so .seed/totp-secret always matches the user.
  const factors = check(await admin.auth.admin.mfa.listFactors({ userId: superId }), "list factors");
  for (const f of factors.factors) {
    check(await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: superId }), "delete factor");
  }
  const client = createClient(url, env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  check(await client.auth.signInWithPassword({ email: SUPER, password }), "sign in super");
  const enrolled = check(await client.auth.mfa.enroll({ factorType: "totp" }), "enroll totp");
  const challenge = check(await client.auth.mfa.challenge({ factorId: enrolled.id }), "challenge totp");
  check(
    await client.auth.mfa.verify({
      factorId: enrolled.id,
      challengeId: challenge.id,
      code: await generate({ secret: enrolled.totp.secret }),
    }),
    "verify totp",
  );
  mkdirSync(".seed", { recursive: true });
  writeFileSync(".seed/totp-secret", enrolled.totp.secret);
  console.log("seeded users, memberships and super TOTP factor");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
