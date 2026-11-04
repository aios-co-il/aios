-- Teammate names for update feeds (20261103112000_tenant_member_names): a
-- non-owner member reads their teammates' names through tenant_member_names,
-- but not their profile rows (phone), and nothing of another tenant; anon is
-- refused. Synthetic users and tenants inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  member_a uuid := gen_random_uuid(); teammate_a uuid := gen_random_uuid();
  campaigner_login_a uuid := gen_random_uuid(); outsider_b uuid := gen_random_uuid();
  t_a uuid; t_b uuid; campaigner uuid;
  seen text;
  refused boolean;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-member-names-' || u || '@example.invalid'
  FROM unnest(ARRAY[member_a, teammate_a, campaigner_login_a, outsider_b]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK A', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  INSERT INTO public.campaigners (full_name, tenant_id)
  VALUES ('QA campaigner', t_a) RETURNING id INTO campaigner;
  UPDATE public.profiles SET full_name = 'QA teammate', phone = '+972500000001'
  WHERE id = teammate_a;
  UPDATE public.profiles SET full_name = '', campaigner_id = campaigner
  WHERE id = campaigner_login_a;
  UPDATE public.profiles SET full_name = 'QA outsider', phone = '+972500000002'
  WHERE id = outsider_b;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (t_a, member_a, 'member'), (t_a, teammate_a, 'member'),
    (t_a, campaigner_login_a, 'member'), (t_b, outsider_b, 'member');

  IF has_function_privilege('anon', 'public.tenant_member_names(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not call tenant_member_names';
  END IF;

  IF to_regprocedure('public.user_shares_tenant_with(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'the draft helper user_shares_tenant_with must be gone';
  END IF;

  -- A plain member of A.
  PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
  SET LOCAL ROLE authenticated;

  SELECT n.full_name INTO seen FROM public.tenant_member_names(t_a) n WHERE n.user_id = teammate_a;
  IF seen IS DISTINCT FROM 'QA teammate' THEN
    RAISE EXCEPTION 'A member must read a teammate''s name, got %', seen;
  END IF;

  SELECT n.full_name INTO seen FROM public.tenant_member_names(t_a) n WHERE n.user_id = campaigner_login_a;
  IF seen IS DISTINCT FROM 'QA campaigner' THEN
    RAISE EXCEPTION 'A login without a profile name must show its campaigner''s name, got %', seen;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenant_member_names(t_a) n WHERE n.user_id = outsider_b) THEN
    RAISE EXCEPTION 'Names of tenant A must not include a user of tenant B';
  END IF;

  SELECT p.phone INTO seen FROM public.profiles p WHERE p.id = teammate_a;
  IF seen IS NOT NULL THEN
    RAISE EXCEPTION 'A member must not read a teammate''s phone, got %', seen;
  END IF;

  SELECT p.full_name INTO seen FROM public.profiles p WHERE p.id = outsider_b;
  IF seen IS NOT NULL THEN
    RAISE EXCEPTION 'A member must not read another tenant''s profile, got %', seen;
  END IF;

  refused := false;
  BEGIN
    PERFORM public.tenant_member_names(t_b);
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'A member of A must be refused the names of tenant B';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'tenant_member_names: all checks passed';
END
$test$;
ROLLBACK;
