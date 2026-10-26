insert into permissions (key, description) values
  ('venue.info.edit', 'Phones, opening hours, address, manager card');

insert into role_permissions (role_id, permission_key)
select id, 'venue.info.edit' from roles where tenant_id is null and name in ('owner', 'manager');
