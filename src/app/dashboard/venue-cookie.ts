// The dashboard's chosen venue. Only a preference: getDashboard keeps it only if the viewer may open that venue.
export const VENUE_COOKIE = "venue";
export const venueCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;
