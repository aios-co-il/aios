-- CRM table column order, saved per user and per tenant.
--
-- The CRM table's column order was kept in each browser's localStorage, so it
-- did not follow the user to another device. It now lives on the user's
-- lead_list_defaults row, which already holds their Leads-screen default and
-- whose policies let a user read and write only their own row. One user's order
-- never changes another's.
--
-- 1. stage_scope becomes optional: a user who saved only a column order has a
--    row with no stage scope, which the app reads as "no saved scope".
-- 2. column_order: column ids in display order; ids it does not list keep their
--    default place.
--
-- No row changes on deploy. The app moves an order saved in the browser into
-- the user's row once, on their next CRM visit.

alter table public.lead_list_defaults
  alter column stage_scope drop not null;

alter table public.lead_list_defaults
  add column if not exists column_order text[]
    check (column_order is null or cardinality(column_order) <= 200);

comment on column public.lead_list_defaults.column_order is
  'CRM table column ids in the user''s display order; null keeps the default order.';
