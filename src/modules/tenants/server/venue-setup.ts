import "server-only";
import { z } from "zod";
import { createServerClient, createServiceClient, recordAudit, requirePerm } from "@/modules/access";
import { MoneyRulesSchema, TimeSchema, type TenantSettings } from "../settings";
import { readTenantSecret } from "./secrets";

// Halls and slots save on the user's session after a requirePerm check here; RLS, the column-permission trigger and
// the audit trigger (supabase/migrations/20261026000300_settings_m3.sql) check again. Money rules go through the service client.

export type SetupResult = { ok: true } | { error: "invalid" | "forbidden" | "notFound" | "inUse" | "gatewayUnavailable" };

/** Postgres insufficient_privilege: RLS on insert, or the column-permission trigger. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** Postgres foreign_key_violation: a booking still points at the slot (on delete restrict). */
const FOREIGN_KEY_VIOLATION = "23503";

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
  start: TimeSchema,
  end: TimeSchema,
  bufferMinutes: z.int().min(0),
});
export type Slot = z.infer<typeof SlotSchema> & { id: string };

const MoneyRulesInputSchema = MoneyRulesSchema.omit({ currency: true, timeZone: true });

type Write = { error: { code?: string; message: string } | null; data: unknown[] | null };

// An update RLS hides (or another tenant's id) changes no rows and returns no error, so the row count decides.
function result(r: Write, what: string): SetupResult {
  if (r.error?.code === INSUFFICIENT_PRIVILEGE) return { error: "forbidden" };
  if (r.error?.code === FOREIGN_KEY_VIOLATION) return { error: "inUse" };
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
  // Mirrors halls_column_perms: the hire price needs prices.edit, every other field (and a new hall) tenant.settings.edit.
  const stored = id ? (await listHalls(tenantId)).find((h) => h.id === id) : undefined;
  if (id && !stored) return { error: "notFound" };
  const restChanged =
    !stored || name !== stored.name || capacityMin !== stored.capacityMin || capacityMax !== stored.capacityMax || isActive !== stored.isActive;
  const priceChanged = stored ? hirePricePaisa !== stored.hirePricePaisa : hirePricePaisa !== null;
  if (restChanged) await requirePerm(tenantId, "tenant.settings.edit");
  if (priceChanged) await requirePerm(tenantId, "prices.edit");
  // An unchanged save still needs one of the two keys, as the update policy does.
  if (!restChanged && !priceChanged) await requirePerm(tenantId, "tenant.settings.edit").catch(() => requirePerm(tenantId, "prices.edit"));
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
  await requirePerm(tenantId, "tenant.settings.edit");
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
  await requirePerm(tenantId, "tenant.settings.edit");
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

// Money rules are venue setup (tenant.settings.edit); the customer price estimate is a price setting (prices.edit).
const setupOrPrices = (tenantId: string) =>
  requirePerm(tenantId, "tenant.settings.edit").catch(() => requirePerm(tenantId, "prices.edit"));

export async function getMoneyRules(tenantId: string): Promise<TenantSettings["moneyRules"]> {
  await setupOrPrices(tenantId);
  return (await readMoneyRules(tenantId)).rules;
}

const withoutGateway = (methods: string[]) => methods.filter((m) => m !== "gateway").sort();
// Changing these is the venue's mode switch (instant booking, card gateway), not venue setup.
const MODE_PERMS = ["bookings.edit", "payments.verify"] as const;

/**
 * Currency and time zone are not stored here (they live on the tenant), so they are not accepted. A key missing from
 * `input` keeps its stored value, so a form that omits `advanceDueDays` or `paymentAccounts` never resets them.
 * A prices.edit holder may change only showPriceEstimate. Instant booking and the card gateway need bookings.edit and
 * payments.verify; any other change needs tenant.settings.edit. Turning the gateway on also needs a provider for this
 * deployment (`gatewayProvider`, from the payments module, which this module cannot import) and the venue's saved key.
 */
export async function saveMoneyRules(tenantId: string, input: unknown, gatewayProvider: boolean): Promise<SetupResult> {
  await setupOrPrices(tenantId);
  const { stored, rules } = await readMoneyRules(tenantId);
  const parsed = MoneyRulesInputSchema.safeParse({ ...rules, ...(typeof input === "object" ? input : null) });
  if (!parsed.success) return { error: "invalid" };
  const next = parsed.data;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const restChanged = Object.entries(next).some(([key, value]) => {
    if (key === "showPriceEstimate" || key === "instantBooking") return false;
    const before = rules[key as keyof typeof rules];
    return key === "paymentMethods" ? !same(withoutGateway(value as string[]), withoutGateway(before as string[])) : !same(value, before);
  });
  if (restChanged) await requirePerm(tenantId, "tenant.settings.edit");
  const gatewayOn = next.paymentMethods.includes("gateway");
  const gatewayChanged = gatewayOn !== rules.paymentMethods.includes("gateway");
  if (next.instantBooking !== rules.instantBooking || gatewayChanged) for (const key of MODE_PERMS) await requirePerm(tenantId, key);
  if (gatewayOn && gatewayChanged && !(gatewayProvider && (await readTenantSecret(tenantId, "payments")))) return { error: "gatewayUnavailable" };
  const { error } = await createServiceClient().from("tenant_settings").update({ money_rules: next }).eq("tenant_id", tenantId);
  if (error) throw new Error(`money_rules: ${error.message}`);
  await recordAudit({
    tenantId,
    action: "settings.money_rules",
    entity: "tenant_settings",
    entityId: tenantId,
    before: stored,
    after: next,
  });
  return { ok: true };
}
