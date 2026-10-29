-- Drop twelve public tables that nothing uses. David asked to delete the
-- tables we are sure are not in use, after a double check that nothing in use
-- is deleted; these twelve passed it, and he approved deleting them. The drop
-- is irreversible: their rows are not kept anywhere else. Nothing is sent, and
-- no other table's rows change. Each table's own indexes, constraints and
-- policies go with it.
--
-- Evidence (read-only, Production, 2026-11-02): no function, view, policy,
-- trigger, cron job or foreign key references any of the twelve. Outside the
-- generated types, the "excluded" list of scripts/staging-data-manifest.json
-- and the Production baseline, no file on develop or on an open PR branch names
-- one.
--
-- Nine leftovers that exist on Production only. No migration creates or fills
-- them, and Production records no insert, update or delete on them. On Staging
-- and Previews these drops are no-ops.
--   _d_campag   59 rows (campaigner_id, agency_id)
--   _d_prof     35 rows (email, old_id, campaigner_id, sales_person_id)
--   _d_spag     18 rows
--   _d_tu       46 rows (email, role, tenant_id)
--   _d_uma      10 rows
--   _d_ur       54 rows
--   _pol_log     0 rows
--   _pol_stage   0 rows
--   _sqlbuf      4 rows
--
-- Three tables from the Production baseline (20261009000000) that no code ever
-- used: git history of src and supabase/functions names them only in
-- regenerated types files, and Production records no read of them since
-- 2026-10-13 (pg_stat_user_tables.last_seq_scan; idx_scan is 0). The baseline
-- creates them everywhere, so they are dropped on Staging and Previews too.
--   carmen_batch_deliveries   0 rows
--   wa_group_members          0 rows
--   pbn_service_commands     10 rows (token hashes)
--
-- No CASCADE: if anything still depends on one of these tables, the drop fails
-- and the deploy stops instead of removing more than this list.

drop table if exists public._d_campag;
drop table if exists public._d_prof;
drop table if exists public._d_spag;
drop table if exists public._d_tu;
drop table if exists public._d_uma;
drop table if exists public._d_ur;
drop table if exists public._pol_log;
drop table if exists public._pol_stage;
drop table if exists public._sqlbuf;

drop table if exists public.carmen_batch_deliveries;
drop table if exists public.wa_group_members;
drop table if exists public.pbn_service_commands;
