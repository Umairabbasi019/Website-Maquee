-- The key and ext go straight into storage paths (<tenant_id>/<key>/<size>.<ext>), so only safe slugs and known image types.
alter table media_assets
  add constraint media_assets_key_format check (key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  add constraint media_assets_ext_known check (ext in ('jpg', 'png', 'webp'));
