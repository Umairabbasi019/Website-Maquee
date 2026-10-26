-- Venue photos: a public bucket (images are shown on public sites) plus a per-tenant asset table.
-- Storage objects live at <tenant_id>/<key>/{s,m,l}.<ext> and <tenant_id>/<key>/depth.png.
-- No storage policies: the bucket is public for reads, and writes use the service role only.

insert into storage.buckets (id, name, public) values ('venue-media', 'venue-media', true);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  key text not null,
  alt text not null,
  category text not null check (category in ('hero', 'room', 'stage', 'gallery', 'event', 'logo', 'seo')),
  source text,
  licence text,
  sizes text[] not null check (sizes <@ array['s', 'm', 'l', 'depth']),
  ext text not null default 'jpg',
  unique (tenant_id, key)
);

alter table media_assets enable row level security;

create policy media_assets_read on media_assets for select to authenticated
  using (public.auth_has_perm(tenant_id, 'media.manage'));
create policy media_assets_write on media_assets for all to authenticated
  using (public.auth_has_perm(tenant_id, 'media.manage'))
  with check (public.auth_has_perm(tenant_id, 'media.manage'));
