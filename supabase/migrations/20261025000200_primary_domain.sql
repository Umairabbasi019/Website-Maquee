-- The canonical host for a tenant's public site (canonical link, JSON-LD url). At most one per tenant, and only a verified one.
alter table tenant_domains
  add column is_primary boolean not null default false,
  add constraint tenant_domains_primary_verified check (not is_primary or verified_at is not null);
create unique index tenant_domains_one_primary on tenant_domains (tenant_id) where is_primary;

-- Existing tenants: the first verified domain becomes primary.
update tenant_domains set is_primary = true
where id in (
  select distinct on (tenant_id) id from tenant_domains
  where verified_at is not null
  order by tenant_id, verified_at, host
);
