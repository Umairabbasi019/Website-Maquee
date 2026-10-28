import { beforeEach, describe, expect, it, vi } from "vitest";

// The server check runs before any write; RLS is the second layer (tests/db). Here the DB only records writes.
const held = new Set<string>();
const writes: string[] = [];
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

const storedRules = { taxPercent: 0, advancePercent: 50, holdHours: 48, instantBooking: false, paymentMethods: ["bank"], showPriceEstimate: true };

vi.mock("@/modules/access", () => ({
  ForbiddenError,
  recordAudit: async () => {},
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { money_rules: storedRules }, error: null }) }) }),
      update: () => ({ eq: async () => (writes.push("money_rules"), { error: null }) }),
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

const { saveHall, saveSlot, deleteSlot, getMoneyRules, saveMoneyRules } = await import("@/modules/tenants/server/venue-setup");

const hall = { id: stored.id, name: "Main", capacityMin: 100, capacityMax: 500, isActive: true, hirePricePaisa: 5_000_000 };
const slot = { name: "Evening", start: "18:00", end: "23:00", bufferMinutes: 60 };

beforeEach(() => {
  held.clear();
  writes.length = 0;
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
    await expect(saveMoneyRules("t1", { ...storedRules, showPriceEstimate: false })).resolves.toEqual({ ok: true });
    await expect(saveMoneyRules("t1", { ...storedRules, taxPercent: 5 })).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual(["money_rules"]);
  });

  it("lets a tenant.settings.edit holder change any field", async () => {
    held.add("tenant.settings.edit");
    await expect(saveMoneyRules("t1", { ...storedRules, taxPercent: 5, showPriceEstimate: false })).resolves.toEqual({ ok: true });
    expect(writes).toEqual(["money_rules"]);
  });

  it("refuses a caller with neither key", async () => {
    await expect(getMoneyRules("t1")).rejects.toThrow(ForbiddenError);
    await expect(saveMoneyRules("t1", storedRules)).rejects.toThrow(ForbiddenError);
    expect(writes).toEqual([]);
  });
});
