-- Pixel size of each stored variant, {"s": [width, height], ...}, so the site can build srcset w descriptors.
alter table media_assets
  add column dims jsonb not null default '{}'::jsonb check (jsonb_typeof(dims) = 'object');
