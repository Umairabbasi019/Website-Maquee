import { describe, expect, it } from "vitest";
import { paymentState, summarise } from "@/modules/payments/client";

const pay = (amountPaisa: number, status: "pending" | "verified" | "rejected" = "verified", kind: "payment" | "refund" = "payment") => ({
  kind,
  status,
  amountPaisa,
});

describe("summarise", () => {
  it("adds verified payments and subtracts verified refunds", () => {
    const s = summarise(100_000, 50_000, [pay(60_000), pay(10_000, "verified", "refund")]);
    expect(s).toEqual({ totalPaisa: 100_000, advancePaisa: 50_000, paidPaisa: 50_000, balancePaisa: 50_000, advanceMet: true });
  });

  it("ignores pending and rejected rows", () => {
    const s = summarise(100_000, 50_000, [pay(60_000, "pending"), pay(60_000, "rejected"), pay(5_000, "pending", "refund")]);
    expect(s.paidPaisa).toBe(0);
    expect(s.advanceMet).toBe(false);
  });

  it("shows paid as 0, not negative, when refunds exceed payments", () => {
    const s = summarise(100_000, 50_000, [pay(1_000), pay(5_000, "verified", "refund")]);
    expect(s.paidPaisa).toBe(0);
    expect(s.balancePaisa).toBe(100_000);
  });

  it("meets the advance at exactly the advance", () => {
    expect(summarise(100_000, 50_000, [pay(49_999)]).advanceMet).toBe(false);
    expect(summarise(100_000, 50_000, [pay(50_000)]).advanceMet).toBe(true);
  });

  it("lets the balance go negative when the booking is overpaid", () => {
    expect(summarise(100_000, 50_000, [pay(100_000), pay(2_000)]).balancePaisa).toBe(-2_000);
  });
});

describe("paymentState", () => {
  const sum = (paid: number) => summarise(100_000, 50_000, paid ? [pay(paid)] : []);
  const terms = { advanceDueOn: "2027-01-10", payLater: false };

  it("is advanceDue before and on the due day", () => {
    expect(paymentState(sum(0), terms, "2027-01-09")).toBe("advanceDue");
    expect(paymentState(sum(0), terms, "2027-01-10")).toBe("advanceDue");
  });

  it("is advanceOverdue the day after", () => {
    expect(paymentState(sum(0), terms, "2027-01-11")).toBe("advanceOverdue");
  });

  it("is advanceDue with no due date", () => {
    expect(paymentState(sum(0), { advanceDueOn: null, payLater: false }, "2030-01-01")).toBe("advanceDue");
  });

  it("is paysLater whenever the manager marked it and the advance is not met, even overdue", () => {
    expect(paymentState(sum(0), { ...terms, payLater: true }, "2027-02-01")).toBe("paysLater");
  });

  it("is advancePaid, balanceDue and fullyPaid as money arrives", () => {
    expect(paymentState(sum(50_000), terms, "2027-02-01")).toBe("advancePaid");
    expect(paymentState(sum(70_000), terms, "2027-02-01")).toBe("balanceDue");
    expect(paymentState(sum(100_000), terms, "2027-02-01")).toBe("fullyPaid");
    expect(paymentState(sum(120_000), terms, "2027-02-01")).toBe("fullyPaid");
  });

  it("is balanceDue, not advancePaid, for a zero advance", () => {
    expect(paymentState(summarise(100_000, 0, []), terms, "2027-02-01")).toBe("balanceDue");
    expect(paymentState(summarise(100_000, 0, [pay(1_000)]), terms, "2027-02-01")).toBe("balanceDue");
  });

  it("is advancePaid only when paid is exactly a positive advance", () => {
    expect(paymentState(sum(50_000), terms, "2027-02-01")).toBe("advancePaid");
    expect(paymentState(sum(50_001), terms, "2027-02-01")).toBe("balanceDue");
  });

  it("lets the pay-later mark yield once the advance is met", () => {
    expect(paymentState(sum(60_000), { ...terms, payLater: true }, "2027-02-01")).toBe("balanceDue");
  });
});
