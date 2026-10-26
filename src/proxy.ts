import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/modules/access";
import { resolveTenantByHost } from "@/modules/tenants";
import { VENUE_COOKIE, venueCookieOptions } from "./app/dashboard/venue-cookie";

const TENANT_HEADER = "x-tenant-id";
const STATUS_HEADER = "x-tenant-status";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Signed-in routes: refresh the Supabase session here, because Server Components cannot write cookies.
const SESSION_PREFIXES = ["/dashboard", "/admin", "/mfa", "/login", "/auth"];
// Routes that never get a host tenant: the signed-in ones take it from memberships, the API from its own checks.
const NO_TENANT_PREFIXES = [...SESSION_PREFIXES, "/api"];

// Only the admin console link (same-origin) or a typed address (none) may pick a venue; a missing header is refused too.
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  // Never trust tenant headers sent by the browser: drop them on every route, then set our own.
  const headers = new Headers(request.headers);
  headers.delete(TENANT_HEADER);
  headers.delete(STATUS_HEADER);
  const path = request.nextUrl.pathname;

  // "Open dashboard" from the admin console. The id is only a venue choice: getDashboard keeps it
  // only if this viewer may open that tenant (a platform admin at aal2 sees every tenant).
  const choice = path === "/dashboard" ? request.nextUrl.searchParams.get("tenant") : null;
  if (choice && UUID.test(choice)) {
    const url = request.nextUrl.clone();
    url.search = "";
    const response = NextResponse.redirect(url);
    if (TRUSTED_FETCH_SITES.has(request.headers.get("sec-fetch-site") ?? "")) {
      response.cookies.set(VENUE_COOKIE, choice, venueCookieOptions);
    }
    return response;
  }

  if (under(path, SESSION_PREFIXES)) return refreshSession(request, headers);

  if (!under(path, NO_TENANT_PREFIXES)) {
    try {
      const tenant = await resolveTenantByHost(request.headers.get("host") ?? "");
      if (tenant) {
        headers.set(TENANT_HEADER, tenant.tenantId);
        headers.set(STATUS_HEADER, tenant.status);
      }
    } catch {
      // Fail closed: no header means no tenant; the page renders its not-found state.
    }
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
