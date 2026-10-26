-- Spec 4.2: an offer's discount and its optional date range are prices (prices.edit); the rest of the row stays
-- catalogue.edit. Keep in step with COLUMN_KEYS.offers in src/modules/editor/keys.ts.
drop trigger offers_column_perms on offers;
create trigger offers_column_perms before insert or update or delete on offers
  for each row execute function public.check_column_perms(
    'catalogue.edit', 'prices.edit:discount_kind', 'prices.edit:discount_value', 'prices.edit:starts_on', 'prices.edit:ends_on'
  );
