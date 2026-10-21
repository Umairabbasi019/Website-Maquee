-- Secrets are written only by the service role (server code). No client role may touch the table,
-- even if a policy is added by mistake later. (tenant_secrets already has primary key (tenant_id, kind).)
revoke all on public.tenant_secrets from anon, authenticated;
