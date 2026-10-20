"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient, needsMfa } from "@/modules/access";

const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

export type SignInState = { failed: true; email: string } | null;

/** One generic failure for every reason, so the form never reveals which emails exist. Never log the password. */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "").slice(0, 254);
  if (!parsed.success) return { failed: true, email };

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { failed: true, email };

  redirect((await needsMfa(supabase, data.user.id)) ? "/mfa" : "/dashboard");
}

export async function signOut(): Promise<void> {
  await (await createServerClient()).auth.signOut();
  redirect("/login");
}
