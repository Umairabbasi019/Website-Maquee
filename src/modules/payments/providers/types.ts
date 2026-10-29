export type ProviderEvent = { eventId: string; providerRef: string; status: "paid" | "failed"; amountPaisa: number; currency: string };

/** One payment gateway. The merchant (this system) picks the reference, so the payment row exists before the gateway hears of it. */
export interface PaymentProvider {
  id: string;
  /** A fresh, unguessable reference for a new payment. */
  newRef(): string;
  createPayment(i: { paymentId: string; providerRef: string; amountPaisa: number; currency: string; returnUrl: string }): Promise<{ redirectUrl: string }>;
  /** Reads the reference out of a delivery that is not yet verified, only to find the venue whose secret checks it. Null when unreadable. */
  peekRef(rawBody: string): string | null;
  verifyWebhook(rawBody: string, headers: Headers, secret: string): ProviderEvent | null;
  getStatus(providerRef: string, secret: string): Promise<"pending" | "paid" | "failed">;
}
