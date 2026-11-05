-- Synthetic authenticated saves exercise atomic failure, tenant RLS and metadata; everything rolls back.
begin;

-- Fail the asset insert after its project update to prove both are rolled back.
create function pg_temp.reject_creative_test_asset()
returns trigger language plpgsql as $$
begin
  if new.meta ->> 'qa_reject' = 'true' then
    raise exception 'QA asset rejected' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger qa_reject_creative_test_asset before insert on public.marketing_assets
for each row execute function pg_temp.reject_creative_test_asset();

do $test$
declare
  v_actor uuid := gen_random_uuid();
  v_tenant uuid;
  v_other uuid;
  v_item uuid;
  v_other_item uuid;
  v_result uuid;
  v_failed boolean;
  v_payload jsonb := '{"opaque":{"keep":true},"variations":[{"id":"variation"}]}';
  v_meta jsonb := '{"source":"manual_edit","skin_slug":"social_media","variation_id":"variation","variation_name":"name","comments":[{"worker_note":"keep"}],"layers":[],"format":"1:1"}';
begin
  if has_function_privilege('anon', 'public.save_creative_variation(uuid,uuid,jsonb,uuid,text,text,jsonb)', 'execute') then
    raise exception 'Anonymous callers must not execute creative saves';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.save_creative_variation(uuid,uuid,jsonb,uuid,text,text,jsonb)'::regprocedure) then
    raise exception 'Creative saves must use caller RLS';
  end if;
  insert into auth.users (id, email) values (v_actor, v_actor || '@example.invalid');
  insert into public.tenants (name, slug) values ('QA creative', 'qa-creative-' || v_actor) returning id into v_tenant;
  insert into public.tenants (name, slug) values ('QA other', 'qa-other-' || v_actor) returning id into v_other;
  insert into public.tenant_users (tenant_id, user_id, role) values
    (v_tenant, v_actor, 'member'), (v_other, v_actor, 'member');
  insert into public.user_active_tenant (user_id, tenant_id) values (v_actor, v_tenant);
  insert into public.marketing_work_items (tenant_id, title, payload) values (v_tenant, 'QA creative', '{}') returning id into v_item;
  insert into public.marketing_work_items (tenant_id, title, payload) values (v_other, 'QA other', '{}') returning id into v_other_item;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  set local role authenticated;

  v_result := public.save_creative_variation(v_item, v_tenant, v_payload, null, 'image-url', '{"layers":[],"format":"1:1"}', v_meta);
  if v_result <> v_item or (select payload from public.marketing_work_items where id = v_item) <> v_payload then
    raise exception 'Project payload and opaque fields must persist';
  end if;
  if not exists (select 1 from public.marketing_assets where item_id = v_item and tenant_id = v_tenant
      and type = 'image' and url = 'image-url' and meta = v_meta and content = '{"layers":[],"format":"1:1"}') then
    raise exception 'Exact image snapshot and opaque nested metadata must persist';
  end if;
  if exists (select 1 from public.workshop_artifacts where item_id = v_item) then
    raise exception 'Image saves must not create derived workshop artifacts';
  end if;

  begin
    perform public.save_creative_variation(v_item, v_tenant, '{"changed":true}', null, 'bad-image', '{}', '{"qa_reject":true}');
    v_failed := false;
  exception when check_violation then v_failed := true;
  end;
  if not v_failed or (select payload from public.marketing_work_items where id = v_item) <> v_payload
      or (select count(*) from public.marketing_assets where item_id = v_item) <> 1 then
    raise exception 'Asset failure must roll back its paired project update';
  end if;

  begin
    perform public.save_creative_variation(v_item, v_other, '{}', null, 'wrong-scope', '{}', v_meta);
    v_failed := false;
  exception when no_data_found then v_failed := true;
  end;
  if not v_failed then raise exception 'Mismatched item and tenant must reject'; end if;
  -- UPDATE predicates require SELECT RLS too: even a member cannot rewrite their inactive tenant.
  begin
    perform public.save_creative_variation(v_other_item, v_other, '{"changed":true}');
    v_failed := false;
  exception when no_data_found then v_failed := true;
  end;
  if not v_failed then raise exception 'Inactive tenant project-only save must reject despite membership'; end if;

  begin
    perform public.save_creative_variation(v_other_item, v_other, '{}', null, 'other-tenant', '{}', v_meta);
    v_failed := false;
  exception when no_data_found then v_failed := true;
  end;
  if not v_failed then raise exception 'Another tenant project must reject under RLS'; end if;
  begin
    perform public.save_creative_variation(gen_random_uuid(), v_tenant, '{}');
    v_failed := false;
  exception when no_data_found then v_failed := true;
  end;
  if not v_failed then raise exception 'Missing project must reject'; end if;

  perform public.save_creative_variation(v_item, v_tenant, '{"empty_variations":true}');
  if (select count(*) from public.marketing_assets where item_id = v_item) <> 1 then
    raise exception 'Project-only saves must not add snapshots';
  end if;
  reset role;
  if (select payload from public.marketing_work_items where id = v_other_item) <> '{}'::jsonb
      or exists (select 1 from public.marketing_assets where item_id = v_other_item) then
    raise exception 'Another tenant must remain unchanged';
  end if;
  raise notice 'save_creative_variation: all checks passed';
end;
$test$;
rollback;
