import { beforeEach, describe, expect, it, vi } from "vitest";

// The server check runs before any write; RLS is the second layer (tests/db). Here the DB only records writes.
const held = new Set<string>();
const writes: string[] = [];
const stored = { id: "00000000-0000-4000-8000-000000000001", name: "Main", capacity_min: 100, capacity_max: 500, is_active: true, hire_price_paisa: 5_000_000 };

class ForbiddenError extends Error {}
const chain = (op: string) => {
  const q = { eq: () => q, select: async () => (writes.push(op), { data: [{ id: stored.id }], error: null }) };
  return q;
};

vi.mock("@/modules/access", () => ({
  ForbiddenError,
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

const { saveHall, saveSlot, deleteSlot } = await import("@/modules/tenants/server/venue-setup");

const hall = { id: stored.id, name: "Main", capacityMin: 100, capacityMax: 500, isActive: true, hirePricePaisa: 5_000_000 };
const slot = { name: "Evening", start: "18:00", end: "23:00", bufferMinutes: 60 };

beforeEach(() => {
  held.clear();
  writes.length = 0;
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
});
