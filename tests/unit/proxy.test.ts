import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A Supabase client whose getUser() "rotates" the session, the way an expired access token does.
const ssr = vi.hoisted(() => ({ calls: 0, seen: [] as { name: string; value: string }[][] }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { getAll(): { name: string; value: string }[]; setAll(l: unknown[], h: Record<string, string>): void } }) => ({
    auth: {
      getUser: async () => {
        ssr.calls++;
        ssr.seen.push(opts.cookies.getAll());
        opts.cookies.setAll(
          [{ name: "sb-auth-token", value: "rotated", options: { path: "/", httpOnly: true } }],
          { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
        );
        return { data: { user: null }, error: null };
      },
    },
  }),
}));
vi.mock("@/modules/tenants", () => ({
  resolveTenantByHost: async () => ({ tenantId: "tenant-from-host", status: "paused" }),
}));

const { proxy } = await import("@/proxy");

const request = (path: string, fetchSite?: string) =>
  new NextRequest(`http://manor.localhost:3000${path}`, {
    headers: {
      ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
      host: "manor.localhost:3000",
      cookie: "sb-auth-token=old; other=1",
      "x-tenant-id": "forged",
      "x-tenant-status": "live",
    },
  });

beforeEach(() => {
  ssr.calls = 0;
  ssr.seen = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";
});

describe("proxy session refresh", () => {
  it.each(["/dashboard", "/dashboard/users", "/site-preview", "/admin", "/mfa", "/login", "/auth/signed-out"])(
    "refreshes on %s and passes rotated cookies both ways",
    async (path) => {
      const res = await proxy(request(path));
      expect(ssr.calls).toBe(1);
      expect(ssr.seen[0]).toContainEqual({ name: "sb-auth-token", value: "old" });
      // Browser gets the new cookie...
      expect(res.headers.get("set-cookie")).toContain("sb-auth-token=rotated");
      expect(res.headers.get("cache-control")).toContain("no-store");
      // ...and this request's Server Components read it too, so they never reuse the old refresh token.
      const forwarded = res.headers.get("x-middleware-request-cookie") ?? "";
      expect(forwarded).toContain("sb-auth-token=rotated");
      expect(forwarded).toContain("other=1");
      // Private routes never carry a tenant id, forged or resolved.
      expect(res.headers.get("x-middleware-override-headers")).not.toContain("x-tenant-id");
      expect(res.headers.get("x-middleware-request-x-tenant-id")).toBeNull();
    },
  );

  it("skips the refresh on public tenant pages and sets the tenant from the host", async () => {
    const res = await proxy(request("/"));
    expect(ssr.calls).toBe(0);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-tenant-id")).toBe("tenant-from-host");
    expect(res.headers.get("x-middleware-request-x-tenant-status")).toBe("paused");
  });

  it("refuses Next's internal render of a Server Action redirect on public pages, so the browser fetches it itself", async () => {
    const req = request("/book/sent?t=x");
    req.headers.set("x-action-redirect", "/book/sent?t=x;push");
    const res = await proxy(req);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-request-x-tenant-id")).toBeNull();
  });

  it("never forwards a tenant status the browser sent on private routes", async () => {
    const res = await proxy(request("/dashboard"));
    expect(res.headers.get("x-middleware-request-x-tenant-status")).toBeNull();
    expect(res.headers.get("x-middleware-override-headers")).not.toContain("x-tenant-status");
  });

  it("turns /dashboard?tenant=<uuid> into the venue cookie and drops the query", async () => {
    const id = "6f1c2a7e-1b2c-4d3e-8f90-0a1b2c3d4e5f";
    const res = await proxy(request(`/dashboard?tenant=${id}`, "same-origin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://manor.localhost:3000/dashboard");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`venue=${id}`);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("also honours the tenant query on a typed or bookmarked address (sec-fetch-site none)", async () => {
    const id = "6f1c2a7e-1b2c-4d3e-8f90-0a1b2c3d4e5f";
    const res = await proxy(request(`/dashboard?tenant=${id}`, "none"));
    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie")).toContain(`venue=${id}`);
  });

  it.each(["cross-site", "same-site", undefined])(
    "refuses the tenant query when sec-fetch-site is %s: no cookie, query stripped",
    async (site) => {
      const id = "6f1c2a7e-1b2c-4d3e-8f90-0a1b2c3d4e5f";
      const res = await proxy(request(`/dashboard?tenant=${id}`, site));
      expect(res.headers.get("set-cookie") ?? "").not.toContain("venue=");
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://manor.localhost:3000/dashboard");
    },
  );

  it("ignores a tenant query that is not a uuid", async () => {
    const res = await proxy(request("/dashboard?tenant=not-a-uuid"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie") ?? "").not.toContain("venue=");
  });
});
