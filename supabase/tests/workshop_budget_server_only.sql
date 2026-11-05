-- The project budget is server-only (20261026103100_workshop_budget_server_only): synthetic
-- work items inside one transaction that is rolled back. A tenant member writes the payload
-- through the API (authenticated role, with the JWT claims PostgREST sets) and cannot raise the
-- approved budget, lower what was spent, drop the budget or start a project with one; the rest
-- of the change is kept. The edge functions (service role) still write it. Staging only: needs a
-- non-admin tenant member.
BEGIN;
DO $budget$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_new uuid;
  v_payload jsonb;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  -- Approved $5, of which $4.50 is spent (written by the server).
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK budget server only', 'draft',
          '{"workshop":{},"brief":"old","workshop_budget":{"cap_usd":5,"spent_usd":4.5,"unit_usd":{}}}')
  RETURNING id INTO v_item;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_actor)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;
  -- Raise the cap and reset the spend in one write, next to a change of the brief.
  UPDATE public.marketing_work_items
     SET payload = jsonb_set(jsonb_set(payload, '{workshop_budget,cap_usd}', '500'),
                             '{workshop_budget,spent_usd}', '0')
                   || '{"brief":"new"}'
   WHERE id = v_item;
  RESET ROLE;
  SELECT payload INTO v_payload FROM public.marketing_work_items WHERE id = v_item;
  IF (v_payload->'workshop_budget'->>'cap_usd')::numeric <> 5
     OR (v_payload->'workshop_budget'->>'spent_usd')::numeric <> 4.5 THEN
    RAISE EXCEPTION 'member: the approved budget and its spend stay as the server wrote them (%)',
      v_payload->'workshop_budget';
  END IF;
  IF v_payload->>'brief' <> 'new' THEN
    RAISE EXCEPTION 'member: the rest of the change is kept (%)', v_payload->>'brief';
  END IF;

  -- Dropping the budget is undone too.
  SET LOCAL ROLE authenticated;
  UPDATE public.marketing_work_items SET payload = payload - 'workshop_budget' WHERE id = v_item;
  RESET ROLE;
  IF (SELECT (payload->'workshop_budget'->>'cap_usd')::numeric FROM public.marketing_work_items
       WHERE id = v_item) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'member: the budget cannot be dropped';
  END IF;

  -- A project a member makes cannot start with an approved budget.
  SET LOCAL ROLE authenticated;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK member budget', 'draft',
          '{"workshop":{},"workshop_budget":{"cap_usd":500,"spent_usd":0}}')
  RETURNING id INTO v_new;
  RESET ROLE;
  IF (SELECT payload ? 'workshop_budget' FROM public.marketing_work_items WHERE id = v_new) THEN
    RAISE EXCEPTION 'member: a new project starts without a budget';
  END IF;

  -- The edge functions write it with the service role.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE service_role;
  UPDATE public.marketing_work_items
     SET payload = jsonb_set(payload, '{workshop_budget,spent_usd}', '4.8')
   WHERE id = v_item;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  IF (SELECT (payload->'workshop_budget'->>'spent_usd')::numeric FROM public.marketing_work_items
       WHERE id = v_item) <> 4.8 THEN
    RAISE EXCEPTION 'server: the service role records what was spent';
  END IF;

  RAISE NOTICE 'workshop_budget_server_only: all checks passed';
END;
$budget$;
ROLLBACK;
