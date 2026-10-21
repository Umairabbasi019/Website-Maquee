import "server-only";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection, NextResponse, type NextRequest } from "next/server";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Client acting as the signed-in user (cookie session). RLS applies. Call per request, never share. */
export async function createServerClient(): Promise<SupabaseClient> {
  // The auth client reads the clock (token expiry), so it must run at request time, never in a prerender.
  await connection();
  const store = await cookies();
  return createSsrClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies. That is safe: src/proxy.ts refreshes the session
          // (refreshSession) before any signed-in page renders, so the token here is already fresh.
        }
      },
    },
  });
}

/**
 * The @supabase/ssr proxy pattern: refresh an expiring session before the page renders. Rotated
 * cookies go to the browser (Set-Cookie) and into this request's headers, so Server Components
 * read the new token instead of reusing the spent refresh token. `headers` are the request headers
 * the proxy forwards (already cleaned); they are kept.
 */
export async function refreshSession(request: NextRequest, headers: Headers): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers } });
  const supabase = createSsrClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, cacheHeaders) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        headers.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  await supabase.auth.getUser(); // verifies with the auth server and refreshes when expired
  return response;
}

/** Bypasses RLS. Only for server code that has already decided what the caller may see. */
export function createServiceClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
