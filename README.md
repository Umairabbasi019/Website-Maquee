# Marquee Booking Platform

Multi-tenant booking platform for marquees and wedding halls. Read `docs/PROJECT_BRIEF.md` and `docs/ARCHITECTURE.md` first.

## Setup (local)

1. Install and start Docker Desktop.
2. `npm i`
3. `npx supabase start`
4. Copy `.env.example` to `.env.local` and fill it in. `npx supabase status` prints the URL and keys.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `PLATFORM_HOST` (for example `localhost:3000`).
   - `TENANT_SECRETS_KEY`: a base64 32-byte key, for example `openssl rand -base64 32`.
   - `SEED_USER_PASSWORD`: the password for every demo user.
   - `.env.local` holds secrets. Never commit it.
5. `npm run db:seed` resets the local database and creates the demo users.
6. `npm run dev`

The seed script refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` points to `127.0.0.1`, `localhost` or `[::1]`. It cannot touch a hosted project.

## Tests

| Command | What it runs |
|---|---|
| `npm run lint` | ESLint, including the module import rule |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests |
| `npm run test:db` | Database and RLS tests (needs local Supabase) |
| `npm run test:e2e` | Playwright journeys (needs local Supabase) |
| `npm run build` | Production build |

Run `npm run db:seed` before `npm run test:db` and `npm run test:e2e`. They sign in as the seeded users.
