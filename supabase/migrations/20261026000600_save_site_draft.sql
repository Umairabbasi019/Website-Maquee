-- Server-side draft writes (src/modules/editor/server/draft.ts). A compare-and-swap on the revision the server read,
-- with a fresh revision from the global sequence on every write, so a revision a client holds is never reused.
-- Returns the new revision, or null when the draft changed (or was published or discarded) since that read.
create function public.save_site_draft(p_tenant uuid, p_expected_revision bigint, p_payload jsonb, p_changes jsonb)
returns bigint
language sql volatile set search_path = '' as $$
  update public.site_drafts
     set payload = p_payload, changes = p_changes, updated_at = now(),
         revision = nextval('public.site_draft_revision_seq')
   where tenant_id = p_tenant and revision = p_expected_revision
  returning revision;
$$;

revoke execute on function public.save_site_draft(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_site_draft(uuid, bigint, jsonb, jsonb) to service_role;
