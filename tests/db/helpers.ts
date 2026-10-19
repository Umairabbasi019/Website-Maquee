import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const pool = new pg.Pool({ connectionString });

/** Runs fn in a transaction that is always rolled back, so tests leave no data. */
export async function withDb<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

/** Acts as `userId` (role authenticated) or, when null, as anon. Lasts for the transaction. */
export async function asUser(c: pg.PoolClient, userId: string | null): Promise<void> {
  const claims = userId ? { sub: userId, role: "authenticated" } : { role: "anon" };
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
}

export async function createTestUser(c: pg.PoolClient, email: string): Promise<string> {
  const id = randomUUID();
  await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return id;
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
