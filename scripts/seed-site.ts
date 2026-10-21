import { createClient } from "@supabase/supabase-js";
// Relative on purpose: the module index pulls in server-only and React code that plain Node cannot load.
import { IdentitySchema, MessagingSchema, SiteContentSchema, ThemeSchema } from "../src/modules/tenants/settings";
import { assertLocalSupabaseUrl } from "./local-guard";
import { demoContent } from "./seed-data/demo";
import { manorContent, manorIdentity, manorMessaging, manorTheme } from "./seed-data/manor";

process.loadEnvFile(".env.local");

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
assertLocalSupabaseUrl(url);
const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const TEMPLATE = "Standard marquee";

// Throws on error; the return type drops the failure variant, so callers see non-null data.
function check<T extends { data: unknown; error: { message: string } | null }>(
  r: T,
  what: string,
): Exclude<T, { error: { message: string } }>["data"] {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function seedTenant(slug: string, patch: { identity?: object; messaging?: object; theme?: object; content: object }) {
  const tenant = check(await admin.from("tenants").select("id").eq("slug", slug).single(), `tenant ${slug}`);
  const row = check(
    await admin.from("tenant_settings").select("identity, messaging").eq("tenant_id", tenant.id).single(),
    `settings ${slug}`,
  );
  const update = {
    identity: IdentitySchema.parse({ ...row.identity, ...patch.identity }),
    messaging: MessagingSchema.parse({ ...row.messaging, ...patch.messaging }),
    content: SiteContentSchema.parse(patch.content),
    ...(patch.theme && { theme: ThemeSchema.parse(patch.theme) }),
  };
  check(await admin.from("tenant_settings").update(update).eq("tenant_id", tenant.id).select("tenant_id").single(), `update ${slug}`);
}

async function seedTemplate() {
  const template = check(
    await admin.from("tenant_templates").select("id, payload").eq("name", TEMPLATE).single(),
    `template ${TEMPLATE}`,
  );
  const payload = { ...template.payload, settings: { ...template.payload.settings, content: SiteContentSchema.parse(demoContent) } };
  check(await admin.from("tenant_templates").update({ payload }).eq("id", template.id).select("id").single(), "template update");
}

async function main() {
  await seedTenant("manor", { identity: manorIdentity, messaging: manorMessaging, theme: manorTheme, content: manorContent });
  await seedTenant("demo-hall", { content: demoContent });
  await seedTemplate();
  console.log("seeded site content for manor, demo-hall and the template");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
