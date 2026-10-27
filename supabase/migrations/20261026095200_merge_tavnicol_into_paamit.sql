-- AIO-234 data fix: "tavnicol.co.il" (DMM tenant, agency DMM-LTD) is a duplicate of the
-- client "פעמית עסקים" (DMM tenant, agency DMM-MC), whose website is tavnicol.co.il.
-- David confirmed on 27 Oct that tavnicol belongs to פעמית עסקים. The duplicate holds
-- the site's PBN articles and its monthly SEO reports (Sep 2025 - Jul 2026), so the
-- client's history is split, and the articles point at an agency that is not shared
-- with MarketingCaptain.
--
-- David's rule (27 Oct): every environment of a shared agency is shared. So first
-- make sure agency DMM-MC is shared both ways between DMM and MarketingCaptain
-- (agency_tenant_access, read_write), as on Staging. The articles live on
-- MarketingCaptain, and the article client trigger (20261026095100) accepts a
-- DMM-MC client only through that share.
--
-- Move everything that references the duplicate onto פעמית עסקים:
--   1. monthly SEO reports, only for months the target has no report yet;
--   2. PBN articles (their monthly-report trigger dedupes by article id), unless
--      the share is still missing; then they stay, with a notice, rather than
--      fail the deploy;
--   3. communication logs, client updates and Ahrefs reports;
--   4. mark the duplicate inactive, only if no row in any public table still
--      references it (foreign keys to clients and client_id columns); otherwise
--      leave it and list what remains in a notice. The client status triggers act
--      only on 'onboarding' and 'active', and status automations run from the
--      app, not here.
--
-- Clients are found by name, agency and tenant name, so the same migration works on
-- every environment. It does nothing unless exactly one duplicate and exactly one
-- target are found, and it is safe to run again.
do $$
declare
  v_tenant uuid;
  v_mc_tenant uuid;
  v_agency uuid;
  v_agencies int;
  v_shared int := 0;
  v_unshared int;
  r record;
  v_count bigint;
  v_left text := '';
  v_dup uuid;
  v_target uuid;
  v_dups int;
  v_targets int;
  v_reports int;
  v_articles int;
  v_logs int;
  v_updates int;
  v_ahrefs int;
  v_deactivated int;
begin
  select t.id into v_tenant from public.tenants t where t.name = 'DMM';
  if v_tenant is null then
    raise notice 'merge tavnicol: tenant DMM not found, nothing to do';
    return;
  end if;

  -- Share agency DMM-MC both ways between DMM and MarketingCaptain.
  select t.id into v_mc_tenant from public.tenants t where t.name = 'MarketingCaptain';
  select count(*), min(a.id::text)::uuid
    into v_agencies, v_agency
  from public.agencies a
  where a.name = 'DMM-MC';

  if v_mc_tenant is null or v_agencies <> 1 then
    raise notice 'merge tavnicol: tenant MarketingCaptain found: %, % DMM-MC agenc(ies); share not added',
      v_mc_tenant is not null, v_agencies;
  else
    insert into public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level, notes)
    select d.source_id, v_agency, d.accessing_id, 'read_write',
           'Added by the AIO-234 merge of tavnicol.co.il into פעמית עסקים: DMM-MC is shared both ways'
    from (values (v_mc_tenant, v_tenant), (v_tenant, v_mc_tenant)) as d(source_id, accessing_id)
    where not exists (
      select 1 from public.agency_tenant_access ata
       where ata.source_tenant_id = d.source_id
         and ata.agency_id = v_agency
         and ata.accessing_tenant_id = d.accessing_id
    );
    get diagnostics v_shared = row_count;
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

  -- An article of another tenant may name the target only if the target's
  -- agency is shared with that tenant (20261026095100).
  select count(*) into v_unshared
  from public.publishing_articles pa
  join public.clients t on t.id = v_target
  where pa.client_id = v_dup
    and pa.tenant_id is distinct from t.tenant_id
    and not exists (
      select 1 from public.agency_tenant_access ata
       where ata.agency_id = t.agency_id
         and ata.accessing_tenant_id = pa.tenant_id
    );

  if v_unshared > 0 then
    v_articles := 0;
    raise notice 'merge tavnicol: % article(s) belong to a tenant DMM-MC is not shared with; articles not moved',
      v_unshared;
  else
    update public.publishing_articles set client_id = v_target where client_id = v_dup;
    get diagnostics v_articles = row_count;
  end if;

  update public.communication_logs set client_id = v_target where client_id = v_dup;
  get diagnostics v_logs = row_count;

  update public.client_updates set client_id = v_target where client_id = v_dup;
  get diagnostics v_updates = row_count;

  update public.ahrefs_reports set client_id = v_target where client_id = v_dup;
  get diagnostics v_ahrefs = row_count;

  -- Is the duplicate empty? Check every public table column that references
  -- clients by foreign key or is named client_id.
  for r in
    select distinct n.nspname as sch, cl.relname as tbl, a.attname as col,
           a.atttypid = 'uuid'::regtype as is_uuid
    from pg_attribute a
    join pg_class cl on cl.oid = a.attrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and cl.relkind in ('r', 'p')
      and not cl.relispartition
      and a.attnum > 0
      and not a.attisdropped
      and (
        a.attname = 'client_id'
        or exists (
          select 1 from pg_constraint con
           where con.contype = 'f'
             and con.conrelid = cl.oid
             and con.confrelid = 'public.clients'::regclass
             and a.attnum = any (con.conkey)
        )
      )
    order by 1, 2, 3
  loop
    if r.is_uuid then
      execute format('select count(*) from %I.%I where %I = $1', r.sch, r.tbl, r.col)
        into v_count using v_dup;
    else
      execute format('select count(*) from %I.%I where %I::text = $1', r.sch, r.tbl, r.col)
        into v_count using v_dup::text;
    end if;
    if v_count > 0 then
      v_left := v_left || case when v_left = '' then '' else ', ' end
                || format('%s.%s: %s', r.tbl, r.col, v_count);
    end if;
  end loop;

  if v_left = '' then
    update public.clients
       set status = 'inactive'
     where id = v_dup
       and status is distinct from 'inactive';
    get diagnostics v_deactivated = row_count;
  else
    v_deactivated := 0;
    raise notice 'merge tavnicol: duplicate still referenced (%), not deactivated', v_left;
  end if;

  raise notice 'merge tavnicol: added % share(s), moved % reports, % articles, % logs, % updates, % ahrefs reports; duplicate deactivated: %',
    v_shared, v_reports, v_articles, v_logs, v_updates, v_ahrefs, v_deactivated;
end;
$$;
