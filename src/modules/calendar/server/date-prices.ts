import "server-only";
import { createServerClient, requirePerm } from "@/modules/access";
import { DatePriceSchema, type DatePrice } from "../date-prices";

const COLUMNS = "id, starts_on, ends_on, event_type_id, kind, value, label";

type Row = {
  id: string;
  starts_on: string;
  ends_on: string;
  event_type_id: string | null;
  kind: DatePrice["kind"];
  value: number;
  label: string;
};

/** Postgres exclusion_violation: the date_prices_no_overlap constraint. */
const EXCLUSION_VIOLATION = "23P01";

/** Date prices of one tenant, earliest first. Needs bookings.view (RLS). */
export async function listDatePrices(tenantId: string): Promise<DatePrice[]> {
  const { data, error } = await (await createServerClient())
    .from("date_prices")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .order("starts_on")
    .returns<Row[]>();
  if (error) throw new Error(`date_prices: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    eventTypeId: r.event_type_id,
    kind: r.kind,
    value: r.value,
    label: r.label,
  }));
}

/** Inserts the rule, or updates it when `id` is set. Overlap within one scope is refused by the database. */
export async function saveDatePrice(tenantId: string, input: DatePrice): Promise<{ ok: true } | { error: "overlap" | "invalid" }> {
  await requirePerm(tenantId, "calendar.manage");
  const parsed = DatePriceSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { id, startsOn, endsOn, eventTypeId, kind, value, label } = parsed.data;
  const { error } = await (await createServerClient())
    .from("date_prices")
    .upsert({ id, tenant_id: tenantId, starts_on: startsOn, ends_on: endsOn, event_type_id: eventTypeId, kind, value, label });
  if (error?.code === EXCLUSION_VIOLATION) return { error: "overlap" };
  if (error) throw new Error(`date_prices: ${error.message}`);
  return { ok: true };
}

export async function deleteDatePrice(tenantId: string, id: string): Promise<void> {
  await requirePerm(tenantId, "calendar.manage");
  const { error } = await (await createServerClient()).from("date_prices").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(`date_prices: ${error.message}`);
}
