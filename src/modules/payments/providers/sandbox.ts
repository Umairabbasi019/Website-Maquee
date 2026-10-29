import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@/modules/access";
import { check } from "@/modules/booking";
import type { PaymentProvider, ProviderEvent } from "./types";

export const SIGNATURE_HEADER = "x-sandbox-signature";

const EventSchema = z.object({
  eventId: z.string().min(1).max(100),
  providerRef: z.string().min(1).max(100),
  status: z.enum(["paid", "failed"]),
  amountPaisa: z.number().int().positive(),
  currency: z.string().length(3),
});

/** HMAC-SHA256 of the raw body with the venue's secret, as hex. */
export const signSandbox = (rawBody: string, secret: string) => createHmac("sha256", secret).update(rawBody).digest("hex");

const PeekSchema = z.object({ providerRef: z.string() });

/** A fake gateway for local work and tests: same signed-webhook shape as a real one, no money. */
export const sandboxProvider: PaymentProvider = {
  id: "sandbox",
  newRef: () => `sbx_${randomBytes(16).toString("base64url")}`,
  createPayment: async ({ providerRef }) => ({ redirectUrl: `/pay/sandbox/${providerRef}` }),
  peekRef(rawBody) {
    try {
      return PeekSchema.parse(JSON.parse(rawBody)).providerRef;
    } catch {
      return null;
    }
  },
  verifyWebhook(rawBody, headers, secret): ProviderEvent | null {
    const given = Buffer.from(headers.get(SIGNATURE_HEADER) ?? "");
    const expected = Buffer.from(signSandbox(rawBody, secret));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      return EventSchema.parse(JSON.parse(rawBody));
    } catch {
      return null;
    }
  },
  // shortcut: sandbox status comes from our own table; a real adapter calls the gateway.
  async getStatus(providerRef) {
    const latest = check(
      await createServiceClient()
        .from("provider_events")
        .select("payload")
        .eq("provider", "sandbox")
        .eq("payload->>providerRef", providerRef)
        .eq("result", "applied")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ payload: ProviderEvent }>(),
      "provider_events",
    );
    return latest?.payload.status ?? "pending";
  },
};
