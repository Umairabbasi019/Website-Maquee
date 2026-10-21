import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/modules/access";
import { resolveTenantByHost } from "@/modules/tenants";

const TENANT_HEADER = "x-tenant-id";
// Signed-in routes: refresh the Supabase session here, because Server Components cannot write cookies.
const SESSION_PREFIXES = ["/dashboard", "/admin", "/mfa", "/login", "/auth"];
// Routes that never get a host tenant: the signed-in ones take it from memberships, the API from its own checks.
const NO_TENANT_PREFIXES = [...SESSION_PREFIXES, "/api"];

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  // Never trust a tenant id sent by the browser: drop it on every route, then set our own.
  const headers = new Headers(request.headers);
  headers.delete(TENANT_HEADER);
  const path = request.nextUrl.pathname;

  if (under(path, SESSION_PREFIXES)) return refreshSession(request, headers);

  if (!under(path, NO_TENANT_PREFIXES)) {
    try {
      const tenant = await resolveTenantByHost(request.headers.get("host") ?? "");
      if (tenant) headers.set(TENANT_HEADER, tenant.tenantId);
    } catch {
      // Fail closed: no header means no tenant; the page renders its not-found state.
    }
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
