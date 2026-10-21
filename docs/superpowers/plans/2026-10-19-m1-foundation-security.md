# M1 Foundation and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js app on local Supabase with tenants, users, permission keys, RLS, audit log, login with super admin MFA, a permission-filtered dashboard shell and a super admin console shell, seeded with two demo tenants.

**Architecture:** Feature modules in `src/modules/<name>/` expose only `index.ts`; a lint rule blocks deep imports. Tenant isolation lives in SQL (RLS + `auth_has_perm`) and is re-checked on the server with `can()`. Tenant comes from the host name for public pages and from the membership for signed-in work.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase CLI 2 (local Docker stack), `@supabase/supabase-js` 2, `@supabase/ssr`, Zod 4, Vitest 5, Playwright 1.64, `pg` for DB tests, `tsx` for scripts, `otplib` for TOTP in seed and tests.

**Spec:** `docs/superpowers/specs/2026-10-19-manor-marquee-design.md` plus `docs/REQUIREMENTS.md` (TEN, USR, CHG), `docs/JOURNEYS.md` (permission matrix), `docs/DATA_MODEL.md` (tenants, access), `docs/ARCHITECTURE.md`.

## Global Constraints

- Branch `feat/m1-foundation`; never commit to `main`. Every commit message ends with `Co-authored-by: Umair Abbasi <umairabbasi.019@gmail.com>`; no Claude/Anthropic credit.
- Versions checked on 2026-10-19: next 16.4.2, supabase CLI 2.121.0, @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7, tailwindcss 4.3.3, vitest 5.0.5, @playwright/test 1.64.1, zod 4.6.7. Added for scripts and MFA tests: tsx, otplib (latest at install). Re-check official docs for breaking changes before Task 1 (Next 16 uses `proxy.ts` in place of `middleware.ts`; confirm).
- No dependency beyond this list without stating why in the task's commit message.
- Never trust a tenant ID from the browser. Every tenant table has RLS enabled and a negative test.
- No secrets in client code or git. `.env.local` is ignored; `.env.example` lists every variable.
- Permission keys exactly as in `docs/JOURNEYS.md`: `platform.tenants.manage`, `tenant.settings.edit`, `users.manage`, `bookings.view`, `bookings.edit`, `quotes.override`, `calendar.manage`, `catalogue.edit`, `prices.edit`, `media.manage`, `payments.view`, `payments.verify`, `enquiries.handle`, `marketing.send`, `reports.view`, `schedule.manage`, `schedule.view_own`, `audit.view`.
- Built-in roles: `owner`, `manager`, `accounts`, `staff`, defaults per the ✓ cells of the matrix. Default manager login limit 2 per tenant; total login limit default 5 (owner + 2 managers + 2 others), set per tenant by super admin.
- Staff login is email + password in M1 (phone OTP needs an SMS provider, later). Super admin must use TOTP MFA (Supabase Auth MFA, `aal2`).
- UI copy in English through `src/ui/i18n/en.ts`; no inline user-facing strings in components.

## Review Focus

1. A deactivated user who still holds a valid session cookie tries an action → refused, because `auth_has_perm` reads `memberships.is_active` on every query (test in Task 3).
2. A tenant is paused while its users are signed in → their queries return nothing and the dashboard shows "This venue is paused"; super admin still sees it (test in Task 3 and Task 9).
3. Host header variants: uppercase, trailing dot, port, `www.` prefix, unknown host → normalised lookup; unknown host gets the platform 404, never another tenant's site (test in Task 5).
4. A user with `users.manage` tries to grant `platform.tenants.manage` or any key they do not hold themselves → rejected in the database (test in Task 3).
5. Two invites at the same moment would exceed a tenant's login limit → only one succeeds (test in Task 4).

---

### Task 0: Docker prerequisite (done by the user)

- [ ] **Step 1:** User installs Docker Desktop for Windows from docker.com (accepts WSL2 install, restarts the PC, opens Docker Desktop once).
- [ ] **Step 2:** Verify. Run: `docker info --format '{{.ServerVersion}}'`. Expected: a version number, no error.

### Task 1: Scaffold the app and module boundaries

**Files:**
- Create: Next.js app at repo root (`package.json`, `src/app/`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`)
- Create: `src/modules/{tenants,access}/index.ts`, `src/providers/README.md`, `src/sections/README.md`, `src/ui/tokens.css`, `src/ui/i18n/en.ts`
- Create: `vitest.config.ts`, `playwright.config.ts`, `.env.example`
- Test: `tests/lint/module-boundaries.test.ts`, `tests/lint/fixtures/bad-import.ts`

**Interfaces:**
- Produces: path alias `@/*` → `src/*`; npm scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:db`, `test:e2e`; `t(key: keyof typeof en): string` from `src/ui/i18n`.

- [ ] **Step 1:** `git checkout -b feat/m1-foundation`, then `npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (keep existing files; answer "no" to Turbopack questions only if the docs say it is optional).
- [ ] **Step 2: Write the failing test** `tests/lint/module-boundaries.test.ts`: runs ESLint's Node API on `tests/lint/fixtures/bad-import.ts` (which contains `import { x } from "@/modules/access/server/can"`) and expects exactly one `no-restricted-imports` error; runs it on a fixture importing `@/modules/access` and expects zero.
- [ ] **Step 3:** Run `npx vitest run tests/lint`. Expected: FAIL (rule not configured).
- [ ] **Step 4:** Add to `eslint.config.mjs` a `no-restricted-imports` rule with pattern `@/modules/*/*` and message "Import modules only through their index.ts", disabled inside `src/modules/<same>/**` via per-folder override.
- [ ] **Step 5:** Run `npx vitest run tests/lint`. Expected: PASS.
- [ ] **Step 6:** Write `.env.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `PLATFORM_HOST`, `TENANT_SECRETS_KEY`, each with a one-line comment. Put Manor theme tokens from `docs/VISUAL_BRIEF.md` in `src/ui/tokens.css` as CSS variables (`--color-bg`, `--color-accent`, `--color-text`, `--color-muted`, `--color-brand`) with platform defaults; tenants override them at runtime later.
- [ ] **Step 7:** Run `npm run lint && npm run typecheck && npm run build`. Expected: all succeed.
- [ ] **Step 8:** Commit `chore: scaffold Next.js app with module boundaries`.

### Task 2: Local Supabase and tenants schema

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/migrations/20261020000100_tenants.sql`
- Create: `tests/db/helpers.ts`
- Test: `tests/db/tenants.schema.test.ts`

**Interfaces:**
- Produces (SQL): tables `accounts`, `tenants`, `tenant_domains`, `tenant_settings`, `tenant_features`, `tenant_secrets`, `tenant_templates`, `halls`, `slots` with columns exactly as in `docs/DATA_MODEL.md` § tenants; `tenants.status` check in (`setup`,`live`,`paused`); `tenants.login_limit int not null default 5`, `tenants.manager_limit int not null default 2`; `tenant_domains.host` stored lowercase, unique.
- Produces (TS): `withDb<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T>` (runs in a transaction, always rolls back); `asUser(c, userId: string | null): Promise<void>` (sets `role authenticated` or `anon` and `request.jwt.claims` with `sub`); `createTestUser(c, email): Promise<string>` (inserts into `auth.users`, returns id).

- [ ] **Step 1:** `npm i -D supabase pg @types/pg`, then `npx supabase init` and `npx supabase start`. Expected: local API, DB on `127.0.0.1:54322`, Studio URL printed. Copy keys to `.env.local`.
- [ ] **Step 2: Write the failing test** `tenants.schema.test.ts`: inserting a tenant with status `open` fails; inserting two domains `Manor.PK` and `manor.pk` fails on uniqueness; `tenant_settings` row is created automatically for a new tenant (trigger).
- [ ] **Step 3:** Run `npm run test:db -- tenants.schema`. Expected: FAIL (tables missing).
- [ ] **Step 4:** Write the migration. Domain lowercasing via a `before insert or update` trigger; `tenant_settings` auto-row via `after insert` trigger on `tenants`. Enable RLS on every table here (policies come in Task 3; until then nothing is readable by `authenticated`).
- [ ] **Step 5:** Run `npx supabase db reset && npm run test:db -- tenants.schema`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(tenants): add tenants schema and DB test harness`.

### Task 3: Access schema, permission functions and RLS

**Files:**
- Create: `supabase/migrations/20261020000200_access.sql`, `supabase/migrations/20261020000300_rls_tenants.sql`
- Test: `tests/db/access.rls.test.ts`

**Interfaces:**
- Consumes: Task 2 tables and helpers.
- Produces (SQL): tables `profiles`, `platform_admins`, `permissions`, `roles`, `role_permissions`, `memberships`, `membership_overrides`, `audit_events` (per `DATA_MODEL.md`); seeded 18 permission keys and 4 built-in roles; functions `is_platform_admin() returns boolean`, `auth_has_perm(p_tenant uuid, p_key text) returns boolean` (security definer, stable, `search_path = ''`): true for platform admin; otherwise requires active membership, tenant status not `paused`, and (role grants key and no `granted=false` override) or a `granted=true` override.
- Produces: RLS policies on all Task 2 and Task 3 tables. Read: `is_platform_admin() or auth_has_perm(tenant_id, 'bookings.view')` for halls/slots, `tenant.settings.edit` for settings/features, `users.manage` for memberships/overrides, `audit.view` for audit_events. `tenant_secrets` and `platform_admins`: no client policies. `tenants`: members read their own tenant row; only platform admin writes. `audit_events`: insert only through function `record_audit(p_tenant uuid, p_action text, p_entity text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_reason text)`; no update/delete for anyone.
- Produces: trigger on `membership_overrides` and `role_permissions` (tenant roles) rejecting any `platform.*` key, and rejecting a grant of a key the acting user does not hold (unless platform admin).

- [ ] **Step 1: Write the failing tests** in `access.rls.test.ts` (each in `withDb`): 
  - `managerOfA_cannotReadTenantB`: for every table with `tenant_id`, `select count(*)` as manager of A on rows of B returns 0, and `update`/`delete` affect 0 rows.
  - `manager_hasDefaultKeys`: `auth_has_perm(A,'prices.edit')` true, `auth_has_perm(A,'users.manage')` false.
  - `override_removesKey`: override `prices.edit`=false → false.
  - `deactivated_getsNothing` (Review Focus 1): set `is_active=false` → every `auth_has_perm` false, selects return 0.
  - `paused_tenant_blocksMembers_notSuperAdmin` (Review Focus 2).
  - `cannot_grant_platform_or_unheld_keys` (Review Focus 4): owner with `users.manage` inserting override `platform.tenants.manage` raises; a manager given `users.manage` trying to grant `audit.view` (a key the manager lacks) → raises.
  - `audit_isAppendOnly`: update and delete on `audit_events` raise or affect 0 rows, even for platform admin.
  - `anon_readsNothing`: as `anon`, every table returns 0 rows.
- [ ] **Step 2:** Run `npm run test:db -- access.rls`. Expected: FAIL.
- [ ] **Step 3:** Write the two migrations.
- [ ] **Step 4:** Run `npx supabase db reset && npm run test:db`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(access): add permissions, RLS and append-only audit log`.

### Task 4: Login limits

**Files:**
- Create: `supabase/migrations/20261020000400_login_limits.sql`
- Test: `tests/db/login-limits.test.ts`

**Interfaces:**
- Produces (SQL): `before insert or update` trigger on `memberships` that locks the tenant row (`select … for update`) and rejects when active memberships would exceed `tenants.login_limit`, or active `manager` memberships would exceed `tenants.manager_limit`. Error code `P0001`, message `login_limit_reached` or `manager_limit_reached`.

- [ ] **Step 1: Write the failing tests:** third active manager → `manager_limit_reached`; sixth active member → `login_limit_reached`; reactivating a user counts; concurrent test (Review Focus 5) opens two pool connections, each inserts the last free membership in its own transaction, commits both → exactly one succeeds.
- [ ] **Step 2:** Run `npm run test:db -- login-limits`. Expected: FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run `npx supabase db reset && npm run test:db`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): enforce per-tenant login limits`.

### Task 5: Server access layer and tenant resolution

**Files:**
- Create: `src/modules/access/server/supabase.ts`, `src/modules/access/server/can.ts`, `src/modules/access/server/audit.ts`, `src/modules/access/permissions.ts`
- Create: `src/modules/tenants/server/resolve.ts`, `src/proxy.ts`
- Modify: `src/modules/access/index.ts`, `src/modules/tenants/index.ts`
- Test: `tests/unit/resolve-host.test.ts`, `tests/db/can.test.ts`

**Interfaces:**
- Produces: `PERMISSIONS` (readonly tuple of the 18 keys) and `type PermissionKey` from `permissions.ts`.
- Produces: `createServerClient(): SupabaseClient` (cookie session via `@supabase/ssr`), `createServiceClient(): SupabaseClient` (server only, `import "server-only"`).
- Produces: `getViewer(): Promise<Viewer | null>` where `Viewer = { userId: string; isPlatformAdmin: boolean; aal: "aal1" | "aal2"; memberships: { tenantId: string; role: string; keys: PermissionKey[] }[] }`, read fresh per request from the DB.
- Produces: `can(viewer: Viewer, tenantId: string, key: PermissionKey): boolean` and `requirePerm(tenantId: string, key: PermissionKey): Promise<Viewer>` (throws `ForbiddenError`; platform admin also requires `aal2`).
- Produces: `recordAudit(input: { tenantId: string | null; action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string }): Promise<void>` calling SQL `record_audit`.
- Produces: `normalizeHost(raw: string): string` and `resolveTenantByHost(host: string): Promise<{ tenantId: string; status: "setup" | "live" | "paused" } | null>`. `proxy.ts` sets header `x-tenant-id` for public routes only; dashboard and admin routes ignore it.

- [ ] **Step 1: Write the failing tests:** `normalizeHost` cases (Review Focus 3): `"Manor.PK"`→`"manor.pk"`, `"manor.pk."`→`"manor.pk"`, `"manor.pk:3000"`→`"manor.pk"`, `"www.manor.pk"`→`"manor.pk"`; `resolveTenantByHost("unknown.example")` → `null`; `<slug>.<PLATFORM_HOST>` resolves by slug. `can.test.ts`: `can()` matches `auth_has_perm` for each seeded role on all 18 keys (table-driven against the DB).
- [ ] **Step 2:** Run `npx vitest run tests/unit/resolve-host.test.ts && npm run test:db -- can`. Expected: FAIL.
- [ ] **Step 3:** Implement the files above. `getViewer` computes `keys` with the same rule as `auth_has_perm` through one SQL function `viewer_keys()` returning `(tenant_id, key)` rows, so the rule lives in one place.
- [ ] **Step 4:** Run both test commands. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): add server permission checks and host-based tenant resolution`.

### Task 6: Tenant settings, templates and setup checklist

**Files:**
- Create: `src/modules/tenants/settings.ts`, `src/modules/tenants/server/create-tenant.ts`, `src/modules/tenants/checklist.ts`, `supabase/migrations/20261020000500_create_tenant_fn.sql`
- Test: `tests/unit/tenant-settings.test.ts`, `tests/db/create-tenant.test.ts`

**Interfaces:**
- Produces: Zod schemas `IdentitySchema`, `ThemeSchema`, `SectionsSchema`, `MoneyRulesSchema`, `MessagingSchema`, `LimitsSchema` and `TenantSettingsSchema` (all fields from spec §3 table; `MoneyRulesSchema.holdHours` default 48, `currency` default `"PKR"`, `timeZone` default `"Asia/Karachi"`; `SectionsSchema` = ordered array of `{ key: "hero"|"inside"|"stage"|"gallery"|"events"|"packages"|"contact"|"footer"; visible: boolean }`).
- Produces: SQL `create_tenant_from_template(p_template uuid, p_account uuid, p_name text, p_slug text) returns uuid` (platform admin only, audited); TS `createTenantFromTemplate(input: { templateId: string; accountId: string; name: string; slug: string }): Promise<string>`.
- Produces: `setupChecklist(settings: TenantSettings, counts: { domains: number; halls: number; packages: number; heroMedia: number; paymentAccounts: number }): { item: "domain"|"contacts"|"halls"|"prices"|"photos"|"payments"; done: boolean }[]`.

- [ ] **Step 1: Write the failing tests:** schema rejects a theme colour that is not `#rrggbb`; rejects a slug with uppercase or spaces; sections must contain each key once; checklist marks `domain` false with 0 domains; `create_tenant_from_template` called by a non-admin raises; called by admin creates tenant, settings, features and an audit row.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tenants): add settings schemas, templates and setup checklist`.

### Task 7: Encrypted tenant secrets

**Files:**
- Create: `src/modules/tenants/server/secrets.ts`
- Test: `tests/unit/secrets.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: string): string` and `decryptSecret(cipher: string): string` (AES-256-GCM via `node:crypto`, key from `TENANT_SECRETS_KEY` as 32-byte base64, output `v1:<iv>:<tag>:<data>` base64 parts); `saveTenantSecret(tenantId: string, kind: "payments" | "whatsapp" | "email", plain: string): Promise<void>` (requires `platform.tenants.manage`, writes with service client, audits without the value). No read function is exported to UI code.

- [ ] **Step 1: Write the failing tests:** round trip; tampered tag throws; wrong key throws; missing or short key throws a clear error at call time; audit entry for a save contains no plaintext.
- [ ] **Step 2:** Run `npx vitest run tests/unit/secrets.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tenants): add encrypted per-tenant secrets`.

### Task 8: Seeds for two demo tenants

**Files:**
- Create: `supabase/seed.sql`, `scripts/seed-users.ts`
- Test: `tests/db/seed.test.ts`

**Interfaces:**
- Produces: template "Standard marquee"; account "Manor Group" with tenant `manor` (Manor theme tokens, status `live`, domain `manor.localhost`); account "Demo Events" with tenant `demo-hall` (platform default theme, status `setup`, domain `demo.localhost`); halls and slots (lunch 12:00–16:00, dinner 19:00–23:00) for both; users created by `scripts/seed-users.ts` through the Supabase admin API: `super@demo.test` (platform admin), and per tenant `owner@`, `manager1@`, `manager2@`, `accounts@`, `staff@` `<slug>.test`. Passwords come from `SEED_USER_PASSWORD` in `.env.local` (added to `.env.example`), never printed or committed. The script signs in as `super@demo.test`, enrolls a TOTP factor, verifies it with an `otplib` code and writes the factor secret to `.seed/totp-secret` (add `.seed/` to `.gitignore`) for the e2e tests.

- [ ] **Step 1: Write the failing test:** after seeding, two tenants exist with different `theme.accent`; each has 5 active memberships; `super@demo.test` is in `platform_admins`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; add npm script `db:seed` = `supabase db reset && tsx scripts/seed-users.ts` (`tsx` as dev dependency, needed to run the TS seed script).
- [ ] **Step 4:** Run `npm run db:seed && npm run test:db -- seed`. Expected: PASS.
- [ ] **Step 5:** Commit `chore: seed two demo tenants and role users`.

### Task 9: Login, MFA and permission-filtered dashboard shell

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/mfa/page.tsx`, `src/app/dashboard/layout.tsx`, `src/app/dashboard/page.tsx`, `src/modules/access/ui/nav.ts`
- Test: `tests/unit/nav.test.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `getViewer`, `can`, `t`.
- Produces: `dashboardNav(viewer: Viewer, tenantId: string): { href: string; labelKey: string }[]` built from the `/dashboard` table in `docs/SITEMAP.md` (each item carries its permission key; items without the key are left out).
- Behaviour: email + password sign-in; wrong password shows one generic error; platform admin without MFA is sent to `/mfa` to enrol TOTP, and with MFA enrolled must pass the challenge before `/admin`; signed-in user with several memberships picks a venue; paused tenant shows `t("venuePaused")`.

- [ ] **Step 1: Write the failing tests:** `nav.test.ts`: staff sees only Schedule; accounts sees Overview, Bookings, Calendar, Payments, Schedule; manager does not see Users or Audit. `auth.spec.ts` (Playwright on `manor.localhost:3000`): manager signs in and sees no Users link; going to `/dashboard/users` directly returns 403 page; deactivated user is signed out on next navigation; super admin is redirected to `/mfa`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/nav.test.ts && npm run test:e2e -- auth`. Expected: FAIL.
- [ ] **Step 3:** Implement. Placeholder dashboard screens show an honest "Coming in M3–M6" empty state, no dead buttons.
- [ ] **Step 4:** Run both. Expected: PASS. Check 1440 and 375 widths in the screenshots.
- [ ] **Step 5:** Commit `feat(access): add login, super admin MFA and filtered dashboard shell`.

### Task 10: Super admin console shell

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/tenants/new/page.tsx`, `src/app/admin/tenants/[id]/page.tsx`, `src/app/admin/tenants/[id]/actions.ts`, `src/modules/tenants/ui/TenantBanner.tsx`
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `requirePerm(…, "platform.tenants.manage")`, `createTenantFromTemplate`, `setupChecklist`, `saveTenantSecret`, `recordAudit`.
- Produces: server actions `setTenantStatus(tenantId: string, status: "setup" | "live" | "paused")`, `setTenantFeature(tenantId: string, key: string, enabled: boolean)`, `setLoginLimits(tenantId: string, loginLimit: number, managerLimit: number)` (integers 1–50, validated with Zod), each audited. `/admin` only answers on `PLATFORM_HOST`.
- Behaviour: tenant list (name, status, domain, last activity); create from template; tenant page with checklist, features, limits, secret fields (write-only, show "saved on <date>"), pause/resume; "Open dashboard" opens `/dashboard?tenant=<id>` with `TenantBanner` naming the tenant. The `tenant` query value is only a choice; access is still `is_platform_admin()`.

- [ ] **Step 1: Write the failing test** `admin.spec.ts`: super admin (MFA via a test TOTP secret from seed) creates tenant "Test Hall" and sees it in the list with 0/6 checklist items; pauses `demo-hall` and `demo.localhost` shows the holding page; manager of Manor opening `/admin` gets 403; lowering Manor's manager limit to 1 while 2 managers are active shows the error `t("managerLimitReached")` and changes nothing.
- [ ] **Step 2:** Run `npm run test:e2e -- admin`. Expected: FAIL.
- [ ] **Step 3:** Implement. Limit changes below current active counts are rejected by a check in `setLoginLimits` that counts active memberships first.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tenants): add super admin console shell`.

### Task 11: Docs, full check and review

**Files:**
- Modify: `docs/ARCHITECTURE.md` (where-to-change rows for real paths), `docs/ROADMAP.md` (M1 status, handoff), `docs/DECISIONS.md` (email+password login, Docker local dev, login limit defaults), `README.md` (create: setup steps — Docker, `npm i`, `npx supabase start`, `.env.local`, `npm run db:seed`, `npm run dev`)

- [ ] **Step 1:** Run `npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:e2e && npm run build`. Expected: all pass; record counts.
- [ ] **Step 2:** Update the docs listed above with what was actually built.
- [ ] **Step 3:** Commit `docs: update roadmap and architecture for M1`.
- [ ] **Step 4:** Run a thorough code review of the branch (superpowers:requesting-code-review), fix findings, re-run Step 1.
- [ ] **Step 5:** Stop and report to the user: changed areas, checks run with results, limitations, what is needed for M2. Merge to `main` only after the user approves.
