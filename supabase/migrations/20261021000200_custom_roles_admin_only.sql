-- Custom tenant roles can bypass the "never" keys and manager_limit, so until M6 designs them
-- only a platform admin (aal2) may write roles and role_permissions. Reads are unchanged.
drop policy roles_write on roles;
create policy roles_write on roles for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy role_permissions_write on role_permissions;
create policy role_permissions_write on role_permissions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
