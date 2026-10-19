import { NextResponse, type NextRequest } from "next/server";
import { resolveTenantByHost } from "@/modules/tenants";

const TENANT_HEADER = "x-tenant-id";
const PRIVATE_PREFIXES = ["/dashboard", "/admin", "/api"];

const isPrivate = (path: string) => PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  // Never trust a tenant id sent by the browser: drop it on every route, then set our own.
  const headers = new Headers(request.headers);
  headers.delete(TENANT_HEADER);

  if (!isPrivate(request.nextUrl.pathname)) {
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
