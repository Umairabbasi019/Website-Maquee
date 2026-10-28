// Runs once when a server starts. A production server without the booking hash secret refuses to start,
// rather than failing every public booking request (hashKey in src/modules/booking/server/request.ts).
export function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV === "production" && !process.env.BOOKING_HASH_SECRET) {
    throw new Error("Missing environment variable BOOKING_HASH_SECRET");
  }
}
