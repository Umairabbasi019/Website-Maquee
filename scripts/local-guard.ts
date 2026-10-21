const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Seeding uses the service role and creates a platform admin, so it must never reach a hosted project. */
export function assertLocalSupabaseUrl(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL; refusing to seed");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to seed: ${host} is not a local Supabase (127.0.0.1, localhost or [::1])`);
  }
}
