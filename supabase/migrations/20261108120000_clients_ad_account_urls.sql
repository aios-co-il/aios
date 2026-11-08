-- A direct link to each client's ads account, set on the client card.
-- Google Ads opens an account by an internal id its API does not return, so
-- a link built from the customer id can land on the account picker when
-- access goes through a manager account; the saved link wins over it.
alter table public.clients
  add column if not exists google_ads_url text,
  add column if not exists meta_ads_url text;

alter table public.clients
  add constraint clients_google_ads_url_https
    check (google_ads_url is null or google_ads_url ~ '^https://'),
  add constraint clients_meta_ads_url_https
    check (meta_ads_url is null or meta_ads_url ~ '^https://');
