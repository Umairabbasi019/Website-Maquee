"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDashboard, VENUE_COOKIE } from "./context";

export async function selectVenue(formData: FormData): Promise<void> {
  const id = formData.get("venue");
  const { venues } = await getDashboard();
  if (venues.some((v) => v.id === id)) {
    (await cookies()).set(VENUE_COOKIE, String(id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  redirect("/dashboard");
}

export async function changeVenue(): Promise<void> {
  (await cookies()).delete(VENUE_COOKIE);
  redirect("/dashboard");
}
