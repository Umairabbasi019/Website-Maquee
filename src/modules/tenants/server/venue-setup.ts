import "server-only";
import { z } from "zod";
import { createServerClient, createServiceClient, recordAudit, requirePerm } from "@/modules/access";
import { MoneyRulesSchema, type TenantSettings } from "../settings";

// Halls and slots save on the user's session: RLS, the column-permission trigger and the audit trigger
// (supabase/migrations/20261026000300_settings_m3.sql) do the checks. Money rules go through the service client.

export type SetupResult = { ok: true } | { error: "invalid" | "forbidden" | "notFound" };

/** Postgres insufficient_privilege: RLS on insert, or the column-permission trigger. */
const INSUFFICIENT_PRIVILEGE = "42501";

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const HallSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(60),
    capacityMin: z.int().min(0),
    capacityMax: z.int(),
    isActive: z.boolean(),
    hirePricePaisa: z.int().positive().nullable(),
  })
  .refine((h) => h.capacityMax >= h.capacityMin, { path: ["capacityMax"] });
export type Hall = z.infer<typeof HallSchema> & { id: string };

const SlotSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  start: Time,
  end: Time,
  bufferMinutes: z.int().min(0),
});
export type Slot = z.infer<typeof SlotSchema> & { id: string };

const MoneyRulesInputSchema = MoneyRulesSchema.omit({ currency: true, timeZone: true });

type Write = { error: { code?: string; message: string } | null; data: unknown[] | null };

// An update RLS hides (or another tenant's id) changes no rows and returns no error, so the row count decides.
function result(r: Write, what: string): SetupResult {
  if (r.error?.code === INSUFFICIENT_PRIVILEGE) return { error: "forbidden" };
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data?.length ? { ok: true } : { error: "notFound" };
}

export async function listHalls(tenantId: string): Promise<Hall[]> {
  const { data, error } = await (await createServerClient())
    .from("halls")
    .select("id, name, capacity_min, capacity_max, is_active, hire_price_paisa")
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw new Error(`halls: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    capacityMin: r.capacity_min,
    capacityMax: r.capacity_max,
    isActive: r.is_active,
    hirePricePaisa: r.hire_price_paisa,
  }));
}

/** Inserts, or updates when `id` is set. A prices.edit-only caller may change only hirePricePaisa (trigger). */
export async function saveHall(tenantId: string, input: unknown): Promise<SetupResult> {
  const parsed = HallSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { id, name, capacityMin, capacityMax, isActive, hirePricePaisa } = parsed.data;
  const row = { name, capacity_min: capacityMin, capacity_max: capacityMax, is_active: isActive, hire_price_paisa: hirePricePaisa };
  const db = (await createServerClient()).from("halls");
  const r = id
    ? await db.update(row).eq("tenant_id", tenantId).eq("id", id).select("id")
    : await db.insert({ ...row, tenant_id: tenantId }).select("id");
  return result(r, "halls");
}

export async function listSlots(tenantId: string): Promise<Slot[]> {
  const { data, error } = await (await createServerClient())
    .from("slots")
    .select("id, name, start_time, end_time, buffer_minutes")
    .eq("tenant_id", tenantId)
    .order("start_time");
  if (error) throw new Error(`slots: ${error.message}`);
  // Postgres time comes back as "HH:MM:SS".
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
    bufferMinutes: r.buffer_minutes,
  }));
}

export async function saveSlot(tenantId: string, input: unknown): Promise<SetupResult> {
  const parsed = SlotSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { id, name, start, end, bufferMinutes } = parsed.data;
  const row = { name, start_time: start, end_time: end, buffer_minutes: bufferMinutes };
  const db = (await createServerClient()).from("slots");
  const r = id
    ? await db.update(row).eq("tenant_id", tenantId).eq("id", id).select("id")
    : await db.insert({ ...row, tenant_id: tenantId }).select("id");
  return result(r, "slots");
}

export async function deleteSlot(tenantId: string, id: string): Promise<SetupResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid" };
  const r = await (await createServerClient()).from("slots").delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  return result(r, "slots");
}

async function readMoneyRules(tenantId: string): Promise<{ stored: unknown; rules: TenantSettings["moneyRules"] }> {
  const { data, error } = await createServiceClient()
    .from("tenant_settings")
    .select("money_rules")
    .eq("tenant_id", tenantId)
    .single<{ money_rules: unknown }>();
  if (error) throw new Error(`money_rules: ${error.message}`);
  return { stored: data.money_rules, rules: MoneyRulesSchema.parse(data.money_rules) };
}

export async function getMoneyRules(tenantId: string): Promise<TenantSettings["moneyRules"]> {
  await requirePerm(tenantId, "tenant.settings.edit");
  return (await readMoneyRules(tenantId)).rules;
}

/** Currency and time zone are not stored here (they live on the tenant), so they are not accepted. */
export async function saveMoneyRules(tenantId: string, input: unknown): Promise<SetupResult> {
  await requirePerm(tenantId, "tenant.settings.edit");
  const parsed = MoneyRulesInputSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { stored } = await readMoneyRules(tenantId);
  const { error } = await createServiceClient().from("tenant_settings").update({ money_rules: parsed.data }).eq("tenant_id", tenantId);
  if (error) throw new Error(`money_rules: ${error.message}`);
  await recordAudit({
    tenantId,
    action: "settings.money_rules",
    entity: "tenant_settings",
    entityId: tenantId,
    before: stored,
    after: parsed.data,
  });
  return { ok: true };
}
