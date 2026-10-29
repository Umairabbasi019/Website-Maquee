"use server";
import { revalidatePath } from "next/cache";
import { can, ForbiddenError, type Viewer } from "@/modules/access";
import { availableProvider } from "@/modules/payments";
import { deleteDatePrice, listDatePrices, saveDatePrice, type DatePrice } from "@/modules/calendar";
import { deleteSlot, getMoneyRules, listHalls, saveHall, saveMoneyRules, saveSlot } from "@/modules/tenants";
import { parseRupees } from "@/sections/shared/format";
import type { TranslationKey } from "@/ui/i18n";
import { getDashboard } from "../context";

export type FormState = { ok: TranslationKey } | { error: TranslationKey } | null;

const ERRORS = {
  invalid: "settings.error.invalid",
  forbidden: "editor.forbidden",
  notFound: "settings.error.notFound",
  overlap: "settings.error.overlap",
  inUse: "settings.error.slotInUse",
  gatewayUnavailable: "settings.error.gatewayUnavailable",
} as const satisfies Record<string, TranslationKey>;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
// Empty is NaN, so the module's Zod schema refuses it instead of reading 0.
const num = (fd: FormData, name: string) => (text(fd, name) === "" ? NaN : Number(text(fd, name)));
const id = (fd: FormData) => text(fd, "id") || undefined;

// The venue only ever comes from the dashboard session; the browser sends only the row id it acts on, and every
// write filters by this venue, so another venue's id changes nothing.
async function inVenue(fn: (tenantId: string, viewer: Viewer) => Promise<FormState>): Promise<FormState> {
  const { viewer, venue } = await getDashboard();
  if (!venue) return { error: "editor.noVenue" };
  try {
    const state = await fn(venue.id, viewer);
    if (state && "ok" in state) revalidatePath("/dashboard/settings");
    return state;
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: ERRORS.forbidden };
    throw e;
  }
}

const done = (r: { ok: true } | { error: keyof typeof ERRORS }, ok: TranslationKey = "settings.saved"): FormState =>
  "ok" in r ? { ok } : { error: ERRORS[r.error] };

export async function saveHallAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const rawPrice = text(fd, "hirePrice");
  const hirePricePaisa = rawPrice === "" ? null : parseRupees(rawPrice);
  if (hirePricePaisa === null && rawPrice !== "") return { error: "settings.error.rupees" };
  return inVenue(async (tenantId, viewer) => {
    if (can(viewer, tenantId, "tenant.settings.edit")) {
      return done(
        await saveHall(tenantId, {
          id: id(fd),
          name: text(fd, "name"),
          capacityMin: num(fd, "capacityMin"),
          capacityMax: num(fd, "capacityMax"),
          isActive: fd.get("isActive") === "on",
          hirePricePaisa,
        }),
      );
    }
    // A prices-only editor sends just the price; the rest is the stored row, so nothing else can change.
    const hall = (await listHalls(tenantId)).find((h) => h.id === id(fd));
    if (!hall) return { error: ERRORS.notFound };
    return done(await saveHall(tenantId, { ...hall, hirePricePaisa }));
  });
}

export async function saveSlotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return inVenue(async (tenantId) =>
    done(
      await saveSlot(tenantId, {
        id: id(fd),
        name: text(fd, "name"),
        start: text(fd, "start"),
        end: text(fd, "end"),
        bufferMinutes: num(fd, "bufferMinutes"),
      }),
    ),
  );
}

export async function deleteSlotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return inVenue(async (tenantId) => done(await deleteSlot(tenantId, text(fd, "id")), "settings.deleted"));
}

/** Percent is a whole number; per guest is rupees, a leading minus for a discount. */
function datePriceValue(kind: string, raw: string): number | null {
  if (kind === "percent") return /^-?\d+$/.test(raw) ? Number(raw) : null;
  const negative = raw.startsWith("-");
  const paisa = parseRupees(negative ? raw.slice(1) : raw);
  return paisa === null ? null : negative ? -paisa : paisa;
}

// saveDatePrice throws (RLS) on another venue's id instead of returning an error, so ids are checked first.
const isOwnDatePrice = async (tenantId: string, rowId: string) => (await listDatePrices(tenantId)).some((p) => p.id === rowId);

export async function saveDatePriceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const kind = text(fd, "kind");
  const value = datePriceValue(kind, text(fd, "value"));
  if (value === null) return { error: kind === "percent" ? ERRORS.invalid : "settings.error.rupees" };
  return inVenue(async (tenantId) => {
    const rowId = id(fd);
    if (rowId && !(await isOwnDatePrice(tenantId, rowId))) return { error: ERRORS.notFound };
    return done(
      await saveDatePrice(tenantId, {
        id: rowId,
        startsOn: text(fd, "startsOn"),
        endsOn: text(fd, "endsOn"),
        eventTypeId: text(fd, "eventTypeId") || null,
        kind: kind as DatePrice["kind"], // checked by DatePriceSchema inside saveDatePrice
        value,
        label: text(fd, "label"),
      }),
    );
  });
}

export async function deleteDatePriceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return inVenue(async (tenantId) => {
    const rowId = text(fd, "id");
    if (!(await isOwnDatePrice(tenantId, rowId))) return { error: ERRORS.notFound };
    await deleteDatePrice(tenantId, rowId);
    return { ok: "settings.deleted" };
  });
}

export async function saveMoneyRulesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const showPriceEstimate = fd.get("showPriceEstimate") === "on";
  return inVenue(async (tenantId, viewer) => {
    // A disabled field is not posted, so a role sends only the fields it may change; saveMoneyRules keeps the stored
    // value of every key left out (and the schema drops currency and time zone), so nothing else can change.
    const setup = can(viewer, tenantId, "tenant.settings.edit");
    const mode = can(viewer, tenantId, "bookings.edit") && can(viewer, tenantId, "payments.verify");
    const stored = await getMoneyRules(tenantId);
    const asked = fd.getAll("paymentMethods").map(String);
    const gateway = (mode ? asked : stored.paymentMethods).includes("gateway");
    const methods = (setup ? asked : stored.paymentMethods).filter((m) => m !== "gateway");
    return done(
      await saveMoneyRules(
        tenantId,
        {
          showPriceEstimate,
          paymentMethods: gateway ? [...methods, "gateway"] : methods,
          ...(mode && { instantBooking: fd.get("instantBooking") === "on" }),
          ...(setup && { taxPercent: num(fd, "taxPercent"), advancePercent: num(fd, "advancePercent"), holdHours: num(fd, "holdHours") }),
        },
        availableProvider() !== null,
      ),
    );
  });
}
