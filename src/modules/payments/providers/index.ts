import { sandboxProvider } from "./sandbox";
import type { PaymentProvider } from "./types";

export type { PaymentProvider, ProviderEvent } from "./types";

/** The provider this deployment can use, or null. The sandbox needs PAYMENTS_SANDBOX=1 and never runs in production. */
export function availableProvider(): PaymentProvider | null {
  return process.env.PAYMENTS_SANDBOX === "1" && process.env.NODE_ENV !== "production" ? sandboxProvider : null;
}

export function getProvider(id: string): PaymentProvider | null {
  const p = availableProvider();
  return p?.id === id ? p : null;
}
