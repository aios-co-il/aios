-- Teammate profiles (20261102130000_profiles_visible_to_tenant_members): a
-- non-owner member reads the profiles of users in their tenants and no one
-- else's, and the co-membership helper only ever answers for the caller.
-- Synthetic users and tenants inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  member_a uuid := gen_random_uuid(); teammate_a uuid := gen_random_uuid();
  outsider_b uuid := gen_random_uuid(); dual_ab uuid := gen_random_uuid();
  t_a uuid; t_b uuid;
  seen text;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-profiles-' || u || '@example.invalid'
  FROM unnest(ARRAY[member_a, teammate_a, outsider_b, dual_ab]) AS u;
  UPDATE public.profiles SET full_name = 'QA teammate' WHERE id = teammate_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK A', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  -- dual_ab belongs to both tenants; member_a and teammate_a only to A.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (t_a, member_a, 'member'), (t_a, teammate_a, 'member'), (t_a, dual_ab, 'member'),
    (t_b, outsider_b, 'member'), (t_b, dual_ab, 'member');

  IF has_function_privilege('anon', 'public.user_shares_tenant_with(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not call user_shares_tenant_with';
  END IF;

  -- A plain member of A.
  PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
  SET LOCAL ROLE authenticated;

  SELECT full_name INTO seen FROM public.profiles WHERE id = teammate_a;
  IF seen IS DISTINCT FROM 'QA teammate' THEN
    RAISE EXCEPTION 'A member must read a teammate''s profile name, got %', seen;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = member_a) THEN
    RAISE EXCEPTION 'A member must still read their own profile';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = dual_ab) THEN
    RAISE EXCEPTION 'A member must read a teammate who also belongs to another tenant';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = outsider_b) THEN
    RAISE EXCEPTION 'A member must not read the profile of another tenant''s user';
  END IF;

  IF public.user_shares_tenant_with(outsider_b) THEN
    RAISE EXCEPTION 'user_shares_tenant_with must be false for a user of another tenant';
  END IF;

  -- The member of B sees dual_ab through B, and never member_a of A.
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  SET LOCAL ROLE authenticated;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = dual_ab) THEN
    RAISE EXCEPTION 'A member of B must read a shared member';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id IN (member_a, teammate_a)) THEN
    RAISE EXCEPTION 'A member of B must not read profiles only in A';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'profiles_visible_to_tenant_members: all checks passed';
END
$test$;
ROLLBACK;
