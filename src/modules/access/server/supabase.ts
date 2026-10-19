import "server-only";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Client acting as the signed-in user (cookie session). RLS applies. Call per request, never share. */
export async function createServerClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createSsrClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; the session refresh is retried on the next action.
        }
      },
    },
  });
}

/** Bypasses RLS. Only for server code that has already decided what the caller may see. */
export function createServiceClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
