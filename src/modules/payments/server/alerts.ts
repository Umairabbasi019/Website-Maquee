import "server-only";
import { createServiceClient, requirePerm } from "@/modules/access";
import { check, todayIn } from "@/modules/booking";
import { paymentState, summarise } from "../ledger";

/** Booking ids per alert. Live queries: an alert disappears when its cause is fixed. */
export type PaymentAlerts = {
  receiptsToReview: string[];
  advanceOverdue: string[];
  refundDue: string[];
  onlineStuck: string[];
  rejectedAfterEvent: string[];
};

const ONLINE_STUCK_MS = 60 * 60 * 1000;
const REJECTED_WINDOW_DAYS = 30;
// Bookings that can hold money: everything past the request stage.
const MONEY_STATUSES = ["awaiting_advance", "confirmed", "hold_expired", "refund_pending", "cancelled"];

type Pending = { booking_id: string; source: string; created_at: string };
type Ledger = { booking_id: string; kind: "payment" | "refund"; amount_paisa: number };
type BookingRow = { id: string; status: string; advance_due_on: string | null; pay_later: boolean; refund_due: boolean; current_quote_id: string | null };
type Quote = { id: string; total_paisa: number; advance_paisa: number };

const unique = (ids: string[]) => [...new Set(ids)];

/**
 * The dashboard's payment alerts for holders of payments.verify. `rejectedAfterEvent` is for the owner and the platform
 * admin only; everyone else gets it empty.
 * shortcut: reads the venue's bookings, quotes and verified ledger rows whole (three queries, not one per booking); upgrade
 * to a SQL view that computes paid per booking once a venue has tens of thousands of bookings.
 */
export async function getPaymentAlerts(tenantId: string): Promise<PaymentAlerts> {
  const viewer = await requirePerm(tenantId, "payments.verify");
  const isOwner = viewer.isPlatformAdmin || viewer.memberships.some((m) => m.tenantId === tenantId && m.role === "owner");
  const db = createServiceClient();
  const of = (table: string, columns: string) => db.from(table).select(columns).eq("tenant_id", tenantId);

  const [venue, pending, ledger, bookings, quotes] = await Promise.all([
    db.from("tenants").select("time_zone").eq("id", tenantId).single<{ time_zone: string }>(),
    of("payments", "booking_id, source, created_at").eq("status", "pending").returns<Pending[]>(),
    of("payments", "booking_id, kind, amount_paisa").eq("status", "verified").returns<Ledger[]>(),
    of("bookings", "id, status, advance_due_on, pay_later, refund_due, current_quote_id").in("status", MONEY_STATUSES).returns<BookingRow[]>(),
    of("quotes", "id, total_paisa, advance_paisa").returns<Quote[]>(),
  ]);
  const today = todayIn(check(venue, "tenants").time_zone);
  const quoteById = new Map(check(quotes, "quotes").map((q) => [q.id, q]));
  const rowsByBooking = Map.groupBy(check(ledger, "payments"), (r) => r.booking_id);

  const stuckBefore = Date.now() - ONLINE_STUCK_MS;
  const waiting = check(pending, "payments");
  const alerts: PaymentAlerts = {
    receiptsToReview: unique(waiting.filter((p) => p.source === "customer_receipt").map((p) => p.booking_id)),
    onlineStuck: unique(waiting.filter((p) => p.source === "provider" && Date.parse(p.created_at) < stuckBefore).map((p) => p.booking_id)),
    advanceOverdue: [],
    refundDue: [],
    rejectedAfterEvent: [],
  };

  for (const b of check(bookings, "bookings")) {
    const quote = b.current_quote_id ? quoteById.get(b.current_quote_id) : undefined;
    const rows = (rowsByBooking.get(b.id) ?? []).map((r) => ({ kind: r.kind, status: "verified" as const, amountPaisa: r.amount_paisa }));
    const s = summarise(quote?.total_paisa ?? 0, quote?.advance_paisa ?? 0, rows);
    const owes = b.status === "refund_pending" || (b.status === "cancelled" && b.refund_due && s.paidPaisa > 0) || (quote !== undefined && s.balancePaisa < 0);
    if (owes) alerts.refundDue.push(b.id);
    if (b.status === "confirmed" && quote && paymentState(s, { advanceDueOn: b.advance_due_on, payLater: b.pay_later }, today) === "advanceOverdue") {
      alerts.advanceOverdue.push(b.id);
    }
  }

  if (isOwner) {
    const since = new Date(Date.now() - REJECTED_WINDOW_DAYS * 86_400_000).toISOString();
    const rejected = check(await of("payments", "booking_id").eq("status", "rejected").gte("created_at", since).returns<{ booking_id: string }[]>(), "payments");
    const ids = unique(rejected.map((r) => r.booking_id));
    if (ids.length) {
      const past = check(await of("bookings", "id").in("id", ids).lt("event_date", today).returns<{ id: string }[]>(), "bookings");
      alerts.rejectedAfterEvent = past.map((b) => b.id);
    }
  }
  return alerts;
}
