import { describe, expect, it } from "vitest";
import { customerPayments } from "@/modules/payments/client";

const accounts = {
  bank: { bankName: "Meezan", accountTitle: "Manor Marquee", accountNumber: "PK00MEZN0000000000" },
  jazzcash: { accountTitle: "Manor", number: "03001234567" },
  easypaisa: { accountTitle: "Manor", number: "03007654321" },
};
const row = (over = {}) => ({
  id: "p1",
  kind: "payment" as const,
  method: "bank" as const,
  amountPaisa: 10_000,
  status: "pending" as const,
  rejectReason: null,
  createdAt: "2026-10-28T10:00:00Z",
  ...over,
});
const input = (over = {}) => ({
  status: "awaiting_advance",
  totalPaisa: 100_000,
  advancePaisa: 50_000,
  rows: [],
  methods: ["bank", "jazzcash", "easypaisa"],
  accounts,
  onlineEnabled: false,
  ...over,
});

describe("customerPayments", () => {
  it("lists accounts only for enabled methods that have details", () => {
    const p = customerPayments(input({ methods: ["bank", "easypaisa", "gateway"], accounts: { bank: accounts.bank, jazzcash: accounts.jazzcash } }));
    expect(p?.accounts).toEqual([{ method: "bank", lines: ["Meezan", "Manor Marquee", "PK00MEZN0000000000"] }]);
  });

  it("offers the receipt form with an account, and not without one", () => {
    expect(customerPayments(input())?.canUpload).toBe(true);
    expect(customerPayments(input({ methods: [] }))?.canUpload).toBe(false);
  });

  it("cannot take a receipt on a cancelled or refunded booking, but still shows its rows", () => {
    for (const status of ["cancelled", "refunded"]) {
      const p = customerPayments(input({ status, rows: [row({ status: "verified" })] }));
      expect(p?.canUpload).toBe(false);
      expect(p?.online).toBe(false);
      expect(p?.rows).toHaveLength(1);
    }
  });

  it("shows nothing for a request, a declined request or an expired one", () => {
    for (const status of ["requested", "declined", "expired"]) expect(customerPayments(input({ status }))).toBeNull();
  });

  it("cannot take more once the booking is fully paid", () => {
    const p = customerPayments(input({ rows: [row({ status: "verified", amountPaisa: 100_000 })] }));
    expect(p).toMatchObject({ canUpload: false, online: false });
  });

  it("offers online payment only when the venue has it on", () => {
    expect(customerPayments(input({ onlineEnabled: true }))?.online).toBe(true);
    expect(customerPayments(input())?.online).toBe(false);
  });

  it("leaves staff fields, notes and provider references out of the rows", () => {
    const secret = { source: "staff", note: "n", recordedBy: "u1", verifiedBy: "u2", providerRef: "ref", hasReceipt: true };
    const p = customerPayments(input({ rows: [{ ...row(), ...secret }] }));
    expect(Object.keys(p!.rows[0]).sort()).toEqual(["amountPaisa", "createdAt", "id", "kind", "method", "rejectReason", "status"]);
  });
});
