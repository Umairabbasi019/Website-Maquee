import { afterEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let events: Row[] = [];
const filters: [string, unknown][] = [];

vi.mock("@/modules/access", () => ({
  createServiceClient: () => {
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push([col, val]), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: events[0] ?? null, error: null }),
    };
    return { from: () => q };
  },
}));
vi.mock("@/modules/booking", () => ({
  check: (r: { data: unknown }) => r.data,
}));

const { sandboxProvider, signSandbox } = await import("@/modules/payments/providers/sandbox");
const { availableProvider, getProvider } = await import("@/modules/payments/providers");

const SECRET = "venue-secret";
const EVENT = { eventId: "sbx_evt_1", providerRef: "sbx_abc", status: "paid", amountPaisa: 50_000, currency: "PKR" };
const body = JSON.stringify(EVENT);
const signed = (b: string, secret = SECRET) => new Headers({ "x-sandbox-signature": signSandbox(b, secret) });

afterEach(() => {
  vi.unstubAllEnvs();
  events = [];
  filters.length = 0;
});

describe("sandbox verifyWebhook", () => {
  it("round trips a signed body", () => {
    expect(sandboxProvider.verifyWebhook(body, signed(body), SECRET)).toEqual(EVENT);
  });

  it("returns null when one byte of the body changed", () => {
    const tampered = body.replace("50000", "50001");
    expect(sandboxProvider.verifyWebhook(tampered, signed(body), SECRET)).toBeNull();
  });

  it("returns null without the header, with a short header and with the wrong secret", () => {
    expect(sandboxProvider.verifyWebhook(body, new Headers(), SECRET)).toBeNull();
    expect(sandboxProvider.verifyWebhook(body, new Headers({ "x-sandbox-signature": "ab" }), SECRET)).toBeNull();
    expect(sandboxProvider.verifyWebhook(body, signed(body, "other"), SECRET)).toBeNull();
  });

  it("returns null for a correctly signed body that is not an event", () => {
    for (const bad of ["not json", JSON.stringify({ ...EVENT, status: "refunded" }), JSON.stringify({ ...EVENT, amountPaisa: 1.5 })]) {
      expect(sandboxProvider.verifyWebhook(bad, signed(bad), SECRET)).toBeNull();
    }
  });
});

describe("sandbox provider", () => {
  it("makes unguessable sbx_ references and redirects to its checkout page", async () => {
    const [a, b] = [sandboxProvider.newRef(), sandboxProvider.newRef()];
    expect(a).toMatch(/^sbx_[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
    await expect(
      sandboxProvider.createPayment({ paymentId: "p", providerRef: a, amountPaisa: 1, currency: "PKR", returnUrl: "/b/x" }),
    ).resolves.toEqual({ redirectUrl: `/pay/sandbox/${a}` });
  });

  it("reads the reference of an unverified body, or null", () => {
    expect(sandboxProvider.peekRef(body)).toBe("sbx_abc");
    expect(sandboxProvider.peekRef("nope")).toBeNull();
    expect(sandboxProvider.peekRef(JSON.stringify({ providerRef: 5 }))).toBeNull();
  });

  it("reports the latest applied event as the status, pending when there is none", async () => {
    await expect(sandboxProvider.getStatus("sbx_abc", SECRET)).resolves.toBe("pending");
    events = [{ payload: { ...EVENT, status: "failed" } }];
    await expect(sandboxProvider.getStatus("sbx_abc", SECRET)).resolves.toBe("failed");
    expect(filters).toContainEqual(["result", "applied"]);
  });
});

describe("availableProvider", () => {
  it("is null unless PAYMENTS_SANDBOX=1", () => {
    expect(availableProvider()).toBeNull();
    vi.stubEnv("PAYMENTS_SANDBOX", "1");
    expect(availableProvider()).toBe(sandboxProvider);
    expect(getProvider("sandbox")).toBe(sandboxProvider);
    expect(getProvider("stripe")).toBeNull();
  });

  it("is null in production even when PAYMENTS_SANDBOX=1", () => {
    vi.stubEnv("PAYMENTS_SANDBOX", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(availableProvider()).toBeNull();
    expect(getProvider("sandbox")).toBeNull();
  });
});
