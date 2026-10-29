import { beforeEach, describe, expect, it, vi } from "vitest";

// The server check runs before any write; RLS is the second layer (tests/db). Here the DB only records writes.
const held = new Set<string>();
const writes: string[] = [];
const saved: unknown[] = [];
let secret: string | null = null;
const stored = { id: "00000000-0000-4000-8000-000000000001", name: "Main", capacity_min: 100, capacity_max: 500, is_active: true, hire_price_paisa: 5_000_000 };

let writeError: { code: string; message: string } | null = null;

class ForbiddenError extends Error {}
const chain = (op: string) => {
  const q = {
    eq: () => q,
    select: async () => (writes.push(op), writeError ? { data: null, error: writeError } : { data: [{ id: stored.id }], error: null }),
  };
  return q;
};

const accounts = { bank: { bankName: "Meezan", accountTitle: "Manor", accountNumber: "PK00" } };
const storedRules = {
  taxPercent: 0,
  advancePercent: 50,
  holdHours: 48,
  instantBooking: false,
  paymentMethods: ["bank"],
  showPriceEstimate: true,
  advanceDueDays: 7,
  paymentAccounts: accounts,
};

vi.mock("@/modules/access", () => ({
  ForbiddenError,
  recordAudit: async () => {},
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { money_rules: storedRules }, error: null }) }) }),
      update: (row: { money_rules: unknown }) => ({ eq: async () => (writes.push("money_rules"), saved.push(row.money_rules), { error: null }) }),
    }),
  }),
  requirePerm: async (_tenant: string, key: string) => {
    if (!held.has(key)) throw new ForbiddenError(key);
  },
  createServerClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [stored], error: null }) }) }),
      update: () => chain("update"),
      insert: () => chain("insert"),
      delete: () => chain("delete"),
    }),
  }),
}));

vi.mock("@/modules/tenants/server/secrets", () => ({ readTenantSecret: async () => secret }));

const { saveHall, saveSlot, deleteSlot, getMoneyRules, saveMoneyRules } = await import("@/modules/tenants/server/venue-setup");

const hall = { id: stored.id, name: "Main", capacityMin: 100, capacityMax: 500, isActive: true, hirePricePaisa: 5_000_000 };
const slot = { name: "Evening", start: "18:00", end: "23:00", bufferMinutes: 60 };

beforeEach(() => {
  held.clear();
  writes.length = 0;
  saved.length = 0;
  secret = null;
  writeError = null;
});

describe("saveHall server check", () => {
  it("lets a prices.edit holder change only the hire price", async () => {
    held.add("prices.edit");
    await expect(saveHall("t1", { ...hall, hirePricePaisa: 6_000_000 })).resolves.toEqual({ ok: true });
    await expect(saveHall("t1", { ...hall, name: "Renamed" })).rejects.toThrow(ForbiddenError);
    await expect(saveHall("t1", { ...hall, id: undefined })).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual(["update"]);
  });

  it("needs prices.edit for a price change even with tenant.settings.edit", async () => {
    held.add("tenant.settings.edit");
    await expect(saveHall("t1", { ...hall, isActive: false })).resolves.toEqual({ ok: true });
    await expect(saveHall("t1", { ...hall, hirePricePaisa: null })).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual(["update"]);
  });

  it("refuses a caller with neither key, even for an unchanged save", async () => {
    await expect(saveHall("t1", hall)).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual([]);
  });
});

describe("slot server check", () => {
  it("refuses save and delete without tenant.settings.edit", async () => {
    held.add("prices.edit");
    await expect(saveSlot("t1", slot)).rejects.toThrow(ForbiddenError);
    await expect(deleteSlot("t1", stored.id)).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual([]);
  });

  it("writes with tenant.settings.edit", async () => {
    held.add("tenant.settings.edit");
    await expect(saveSlot("t1", slot)).resolves.toEqual({ ok: true });
    await expect(deleteSlot("t1", stored.id)).resolves.toEqual({ ok: true });
    expect(writes).toEqual(["insert", "delete"]);
  });

  it("says a slot is in use when a booking still points at it", async () => {
    held.add("tenant.settings.edit");
    writeError = { code: "23503", message: "violates foreign key constraint" };
    await expect(deleteSlot("t1", stored.id)).resolves.toEqual({ error: "inUse" });
  });
});

describe("money rules server check", () => {
  it("lets a prices.edit holder read the rules and change only showPriceEstimate", async () => {
    held.add("prices.edit");
    await expect(getMoneyRules("t1")).resolves.toMatchObject({ showPriceEstimate: true });
    await expect(saveMoneyRules("t1", { ...storedRules, showPriceEstimate: false }, false)).resolves.toEqual({ ok: true });
    await expect(saveMoneyRules("t1", { ...storedRules, taxPercent: 5 }, false)).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual(["money_rules"]);
  });

  it("lets a tenant.settings.edit holder change any field", async () => {
    held.add("tenant.settings.edit");
    await expect(saveMoneyRules("t1", { ...storedRules, taxPercent: 5, showPriceEstimate: false }, false)).resolves.toEqual({ ok: true });
    expect(writes).toEqual(["money_rules"]);
  });

  it("refuses a caller with neither key", async () => {
    await expect(getMoneyRules("t1")).rejects.toThrow(ForbiddenError);
    await expect(saveMoneyRules("t1", storedRules, false)).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual([]);
  });

  it("keeps advanceDueDays and paymentAccounts when the form does not send them", async () => {
    held.add("tenant.settings.edit");
    const form = { taxPercent: 5, advancePercent: 50, holdHours: 48, instantBooking: false, showPriceEstimate: true, paymentMethods: ["bank"] };
    await expect(saveMoneyRules("t1", form, false)).resolves.toEqual({ ok: true });
    expect(saved).toEqual([expect.objectContaining({ taxPercent: 5, advanceDueDays: 7, paymentAccounts: accounts })]);
  });

  it("lets a manager (prices.edit, bookings.edit, payments.verify) switch instant booking but not edit advanceDueDays", async () => {
    for (const key of ["prices.edit", "bookings.edit", "payments.verify"]) held.add(key);
    await expect(saveMoneyRules("t1", { instantBooking: true }, false)).resolves.toEqual({ ok: true });
    await expect(saveMoneyRules("t1", { advanceDueDays: 9 }, false)).rejects.toThrow(ForbiddenError);
    expect(saved).toEqual([expect.objectContaining({ instantBooking: true, advanceDueDays: 7 })]);
  });

  it("refuses an accounts user (payments.verify without bookings.edit) the instant booking switch", async () => {
    for (const key of ["prices.edit", "payments.verify"]) held.add(key);
    await expect(saveMoneyRules("t1", { instantBooking: true }, false)).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual([]);
  });

  it("turns the gateway on only with a provider and a saved key", async () => {
    for (const key of ["prices.edit", "bookings.edit", "payments.verify"]) held.add(key);
    const on = { paymentMethods: ["bank", "gateway"] };
    await expect(saveMoneyRules("t1", on, true)).resolves.toEqual({ error: "gatewayUnavailable" });
    secret = "key";
    await expect(saveMoneyRules("t1", on, false)).resolves.toEqual({ error: "gatewayUnavailable" });
    expect(writes).toEqual([]);
    await expect(saveMoneyRules("t1", on, true)).resolves.toEqual({ ok: true });
    expect(saved).toEqual([expect.objectContaining({ paymentMethods: ["bank", "gateway"] })]);
  });

  it("needs the mode permissions for the gateway, and tenant.settings.edit for the other methods", async () => {
    held.add("tenant.settings.edit");
    secret = "key";
    await expect(saveMoneyRules("t1", { paymentMethods: ["bank", "gateway"] }, true)).rejects.toThrow(ForbiddenError);
    held.delete("tenant.settings.edit");
    for (const key of ["prices.edit", "bookings.edit", "payments.verify"]) held.add(key);
    await expect(saveMoneyRules("t1", { paymentMethods: ["bank", "jazzcash"] }, true)).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual([]);
  });
});
