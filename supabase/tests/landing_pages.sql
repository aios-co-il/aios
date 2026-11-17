-- Landing pages (20261117100000_landing_pages): members read and write only
-- their own org's pages; visitors read nothing from the table and get only a
-- published page of an active or trial org through get_published_landing_page.
-- Synthetic users and tenants inside one transaction that is rolled back.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_me uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-lp-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_me, v_outsider]) AS u;
  INSERT INTO public.tenants (name, slug, subdomain)
  VALUES ('QA ROLLBACK own', 'qa-lp-own-' || v_tag, 'qa-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug, subdomain)
  VALUES ('QA ROLLBACK other', 'qa-lp-other-' || v_tag, 'qa-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_me, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.landing_pages (tenant_id, path, title, status) VALUES
    (v_other, '', 'Other home', 'published');

  PERFORM pg_temp.qa_sign_in(v_me);
  SET LOCAL ROLE authenticated;

  -- A member adds a draft home page and a published promo page to their org.
  INSERT INTO public.landing_pages (tenant_id, path, title) VALUES (v_own, '', 'Own home draft');
  INSERT INTO public.landing_pages (tenant_id, path, title, status, published_at)
  VALUES (v_own, 'promo/summer', 'Summer', 'published', now());

  -- A member never sees or writes another org's pages.
  SELECT count(*) INTO v_rows FROM public.landing_pages WHERE tenant_id = v_other;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member: another org''s pages must be hidden, saw %', v_rows;
  END IF;
  BEGIN
    INSERT INTO public.landing_pages (tenant_id, title) VALUES (v_other, 'Hijack');
    RAISE EXCEPTION 'member: insert into another org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.landing_pages SET tenant_id = v_other WHERE tenant_id = v_own AND path = '';
    RAISE EXCEPTION 'member: moving a page to another org must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The member's own pages are both there.
  SELECT count(*) INTO v_rows FROM public.landing_pages WHERE tenant_id = v_own;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'member: own org''s pages must be visible, saw %', v_rows;
  END IF;

  RESET ROLE;
END;
$test$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_own uuid;
  v_rows integer;
  v_title text;
BEGIN
  INSERT INTO public.tenants (name, slug, subdomain)
  VALUES ('QA ROLLBACK visitor', 'qa-lp-vis-' || v_tag, 'qa-vis-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.landing_pages (tenant_id, path, title, status) VALUES
    (v_own, '', 'Draft home', 'draft'),
    (v_own, 'promo/summer', 'Summer', 'published');

  SET LOCAL ROLE anon;

  -- Visitors cannot read the table itself.
  BEGIN
    PERFORM 1 FROM public.landing_pages;
    RAISE EXCEPTION 'anon: reading landing_pages must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Visitors get a published page by host and path, case and slashes ignored.
  SELECT title INTO v_title FROM public.get_published_landing_page('QA-VIS-' || v_tag, '/promo/summer/');
  IF v_title IS DISTINCT FROM 'Summer' THEN
    RAISE EXCEPTION 'anon: published page must be returned, got %', v_title;
  END IF;

  -- Drafts and unknown subdomains return nothing.
  SELECT count(*) INTO v_rows FROM public.get_published_landing_page('qa-vis-' || v_tag, '');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'anon: a draft page must not be returned';
  END IF;
  SELECT count(*) INTO v_rows FROM public.get_published_landing_page('qa-missing-' || v_tag, 'promo/summer');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'anon: an unknown subdomain must not return a page';
  END IF;

  -- A suspended org's pages go offline.
  RESET ROLE;
  UPDATE public.tenants SET status = 'suspended' WHERE id = v_own;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_rows FROM public.get_published_landing_page('qa-vis-' || v_tag, 'promo/summer');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'anon: a suspended org''s page must not be returned';
  END IF;
  RESET ROLE;
END;
$test$;

ROLLBACK;
