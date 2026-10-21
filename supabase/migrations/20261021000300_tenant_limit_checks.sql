-- Same 1 to 50 range set_tenant_limits() enforces, now also a table rule.
alter table public.tenants
  add constraint tenants_login_limit_range check (login_limit between 1 and 50),
  add constraint tenants_manager_limit_range check (manager_limit between 1 and 50);
