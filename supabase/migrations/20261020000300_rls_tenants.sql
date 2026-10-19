-- RLS policies for the tenants and access modules.
-- auth_has_perm() is already true for platform admins, so it alone covers
-- "is_platform_admin() or auth_has_perm(...)"; with a null tenant it is admin-only.
-- Policies are for `authenticated` only: anon has none and so reads nothing.
-- No client policies at all: tenant_secrets, platform_admins.

create policy accounts_admin on accounts for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy tenants_member_read on tenants for select to authenticated
  using (public.is_platform_admin() or public.auth_membership(id) is not null);
create policy tenants_admin_write on tenants for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy tenant_domains_read on tenant_domains for select to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));
create policy tenant_domains_admin_write on tenant_domains for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- The settings row is created by a trigger, so editors only read and update it.
create policy tenant_settings_read on tenant_settings for select to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));
create policy tenant_settings_update on tenant_settings for update to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit'))
  with check (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));

create policy tenant_features_read on tenant_features for select to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));
create policy tenant_features_admin_write on tenant_features for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy tenant_templates_admin on tenant_templates for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Halls and slots are venue setup, so writes need tenant.settings.edit.
create policy halls_read on halls for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy halls_write on halls for all to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit'))
  with check (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));

create policy slots_read on slots for select to authenticated
  using (public.auth_has_perm(tenant_id, 'bookings.view'));
create policy slots_write on slots for all to authenticated
  using (public.auth_has_perm(tenant_id, 'tenant.settings.edit'))
  with check (public.auth_has_perm(tenant_id, 'tenant.settings.edit'));

create policy profiles_own on profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());
create policy profiles_own_insert on profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_own_update on profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy permissions_read on permissions for select to authenticated using (true);

-- Built-in roles (tenant_id null) are readable by everyone signed in; only admins change them.
create policy roles_read on roles for select to authenticated
  using (tenant_id is null or public.auth_has_perm(tenant_id, 'users.manage'));
create policy roles_write on roles for all to authenticated
  using (public.auth_has_perm(tenant_id, 'users.manage'))
  with check (public.auth_has_perm(tenant_id, 'users.manage'));

create policy role_permissions_read on role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id));
create policy role_permissions_write on role_permissions for all to authenticated
  using (exists (select 1 from public.roles r
                 where r.id = role_id and public.auth_has_perm(r.tenant_id, 'users.manage')))
  with check (exists (select 1 from public.roles r
                      where r.id = role_id and public.auth_has_perm(r.tenant_id, 'users.manage')));

create policy memberships_manage on memberships for all to authenticated
  using (public.auth_has_perm(tenant_id, 'users.manage'))
  with check (public.auth_has_perm(tenant_id, 'users.manage'));

create policy membership_overrides_manage on membership_overrides for all to authenticated
  using (exists (select 1 from public.memberships m
                 where m.id = membership_id and public.auth_has_perm(m.tenant_id, 'users.manage')))
  with check (exists (select 1 from public.memberships m
                      where m.id = membership_id and public.auth_has_perm(m.tenant_id, 'users.manage')));

-- Read only. Rows are added through record_audit(); update/delete are blocked by trigger too.
create policy audit_events_read on audit_events for select to authenticated
  using (public.auth_has_perm(tenant_id, 'audit.view'));
