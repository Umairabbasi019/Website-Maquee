-- Platform admin powers need an MFA (aal2) session, enforced here so a direct PostgREST call
-- with an aal1 JWT gets nothing. auth_has_perm and viewer_keys call this function.
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
