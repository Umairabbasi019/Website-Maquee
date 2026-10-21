"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDashboard } from "./context";
import { VENUE_COOKIE, venueCookieOptions } from "./venue-cookie";

export async function selectVenue(formData: FormData): Promise<void> {
  const id = formData.get("venue");
  const { venues } = await getDashboard();
  if (venues.some((v) => v.id === id)) {
    (await cookies()).set(VENUE_COOKIE, String(id), venueCookieOptions);
  }
  redirect("/dashboard");
}

export async function changeVenue(): Promise<void> {
  (await cookies()).delete(VENUE_COOKIE);
  redirect("/dashboard");
}
