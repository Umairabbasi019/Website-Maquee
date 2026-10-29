import "server-only";
import { createServiceClient, requirePerm } from "@/modules/access";
import { check } from "@/modules/booking";

/** Booking ids per alert. Live queries: an alert disappears when its cause is fixed. */
export type PaymentAlerts = {
  receiptsToReview: string[];
  advanceOverdue: string[];
  refundDue: string[];
  onlineStuck: string[];
  rejectedAfterEvent: string[];
};

/**
 * The dashboard's payment alerts for holders of payments.verify. The rules live in SQL (`payment_alerts`), so no API row
 * cap can cut a list short. `rejectedAfterEvent` is for the owner and the platform admin only; everyone else gets it empty.
 */
export async function getPaymentAlerts(tenantId: string): Promise<PaymentAlerts> {
  const viewer = await requirePerm(tenantId, "payments.verify");
  const isOwner = viewer.isPlatformAdmin || viewer.memberships.some((m) => m.tenantId === tenantId && m.role === "owner");
  const alerts = check(await createServiceClient().rpc("payment_alerts", { p_tenant: tenantId }), "payment_alerts") as PaymentAlerts;
  return isOwner ? alerts : { ...alerts, rejectedAfterEvent: [] };
}
