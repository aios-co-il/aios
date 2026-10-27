-- AIO-234 data fix: "tavnicol.co.il" (DMM tenant, agency DMM-LTD) is a duplicate of the
-- client "פעמית עסקים" (DMM tenant, agency DMM-MC), whose website is tavnicol.co.il.
-- David confirmed on 27 Oct that tavnicol belongs to פעמית עסקים. The duplicate holds
-- the site's PBN articles and its monthly SEO reports (Sep 2025 - Jul 2026), so the
-- client's history is split, and the articles point at an agency that is not shared
-- with MarketingCaptain.
--
-- Move everything that references the duplicate onto פעמית עסקים:
--   1. monthly SEO reports, only for months the target has no report yet;
--   2. PBN articles (their monthly-report trigger dedupes by article id);
--   3. communication logs, client updates and Ahrefs reports.
-- The duplicate client row is left as it is (empty), because changing its status
-- fires the onboarding triggers. Archive it from the app.
--
-- Clients are found by name, agency and tenant name, so the same migration works on
-- every environment. It does nothing unless exactly one duplicate and exactly one
-- target are found, and it is safe to run again.
do $$
declare
  v_tenant uuid;
  v_dup uuid;
  v_target uuid;
  v_dups int;
  v_targets int;
  v_reports int;
  v_articles int;
  v_logs int;
  v_updates int;
  v_ahrefs int;
begin
  select t.id into v_tenant from public.tenants t where t.name = 'DMM';
  if v_tenant is null then
    raise notice 'merge tavnicol: tenant DMM not found, nothing to do';
    return;
  end if;

  select count(*), min(c.id::text)::uuid
    into v_dups, v_dup
  from public.clients c
  join public.agencies a on a.id = c.agency_id
  where c.tenant_id = v_tenant
    and c.name = 'tavnicol.co.il'
    and a.name = 'DMM-LTD';

  select count(*), min(c.id::text)::uuid
    into v_targets, v_target
  from public.clients c
  join public.agencies a on a.id = c.agency_id
  where c.tenant_id = v_tenant
    and c.name = 'פעמית עסקים'
    and a.name = 'DMM-MC'
    and c.website ilike '%tavnicol.co.il%';

  if v_dups <> 1 or v_targets <> 1 then
    raise notice 'merge tavnicol: found % duplicate(s) and % target(s), nothing to do', v_dups, v_targets;
    return;
  end if;

  update public.seo_monthly_updates s
     set client_id = v_target
   where s.client_id = v_dup
     and not exists (
       select 1 from public.seo_monthly_updates x
        where x.client_id = v_target and x.month = s.month
     );
  get diagnostics v_reports = row_count;

  update public.publishing_articles set client_id = v_target where client_id = v_dup;
  get diagnostics v_articles = row_count;

  update public.communication_logs set client_id = v_target where client_id = v_dup;
  get diagnostics v_logs = row_count;

  update public.client_updates set client_id = v_target where client_id = v_dup;
  get diagnostics v_updates = row_count;

  update public.ahrefs_reports set client_id = v_target where client_id = v_dup;
  get diagnostics v_ahrefs = row_count;

  raise notice 'merge tavnicol: moved % reports, % articles, % logs, % updates, % ahrefs reports',
    v_reports, v_articles, v_logs, v_updates, v_ahrefs;
end;
$$;
