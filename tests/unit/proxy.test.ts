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
vi.mock("@/modules/tenants", () => ({ resolveTenantByHost: async () => ({ tenantId: "tenant-from-host" }) }));

const { proxy } = await import("@/proxy");

const request = (path: string) =>
  new NextRequest(`http://manor.localhost:3000${path}`, {
    headers: { host: "manor.localhost:3000", cookie: "sb-auth-token=old; other=1", "x-tenant-id": "forged" },
  });

beforeEach(() => {
  ssr.calls = 0;
  ssr.seen = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";
});

describe("proxy session refresh", () => {
  it.each(["/dashboard", "/dashboard/users", "/admin", "/mfa", "/login", "/auth/signed-out"])(
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
  });
});
