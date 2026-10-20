"use server";
import { redirect } from "next/navigation";
import { createServerClient, isPlatformAdminUser } from "@/modules/access";

export type EnrolState = { qr: string; secret: string } | { failed: true } | null;
export type VerifyState = { failed: true } | null;

async function signedIn() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, userId: data.user.id };
}

/** Starts TOTP enrolment for a user with no verified factor. Earlier unfinished tries are dropped first. */
export async function startEnrol(): Promise<EnrolState> {
  const { supabase } = await signedIn();
  const { data: list, error } = await supabase.auth.mfa.listFactors();
  if (error || list.totp.length > 0) return { failed: true };
  for (const f of list.all.filter((f) => f.factor_type === "totp")) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (enrolError) return { failed: true };
  return { qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifies a code against the user's own factor; the server picks the factor, never the browser. */
export async function verifyCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { failed: true };
  const { supabase, userId } = await signedIn();
  const { data: list, error } = await supabase.auth.mfa.listFactors();
  if (error) return { failed: true };
  const factor = list.totp[0] ?? list.all.find((f) => f.factor_type === "totp" && f.status === "unverified");
  if (!factor) return { failed: true };
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (verifyError) return { failed: true };
  redirect((await isPlatformAdminUser(userId)) ? "/admin" : "/dashboard");
}
