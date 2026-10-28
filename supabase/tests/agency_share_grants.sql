-- Agency shares (AIO-234, 20261026095300_agency_share_grants and
-- 20261026095310_agency_share_revoke_chain): who may write
-- agency_tenant_access, how revoking a share ends its re-shares, and which
-- share lets a PBN article name a client of another tenant. Staging only: the test's own tenants, agencies, client,
-- shares, sites and articles, an existing non-admin user as their owner, and a
-- full rollback.
BEGIN;
DO $test$
DECLARE
  actor uuid;
  t_z uuid; t_x uuid; t_y uuid; t_w uuid;
  a_own uuid; a_shared uuid; a_ro uuid; a_other uuid;
  a_chain uuid; a_down uuid; a_cycle uuid; a_rev uuid;
  v_client_agency uuid; v_client uuid;
  v_site_x uuid; v_site_y uuid;
  affected integer;
BEGIN
  -- t_z owns the agencies and the client, t_x (the actor's tenant) is shared
  -- some of them, t_y is a third tenant and t_w a fourth. They are new, so no
  -- share outside this test can change an outcome. user_roles needs an
  -- auth.users row, so the actor is an existing non-admin user; it acts only
  -- through the owner roles it gets in t_x, t_z and t_w.
  SELECT u.id INTO actor FROM auth.users u
  WHERE NOT public.is_super_admin(u.id) ORDER BY u.id LIMIT 1;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Requires a non-admin user';
  END IF;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK Z', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_z;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK X', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_x;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK Y', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_y;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK W', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_w;

  -- The actor owns t_x, and t_z or t_w when it switches its active tenant.
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (actor, t_x)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (actor, 'owner', t_x), (actor, 'owner', t_z), (actor, 'owner', t_w);

  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK own', t_x) RETURNING id INTO a_own;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK shared', t_z) RETURNING id INTO a_shared;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK read only', t_z) RETURNING id INTO a_ro;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK other', t_z) RETURNING id INTO a_other;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK client', t_z) RETURNING id INTO v_client_agency;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK chain', t_z) RETURNING id INTO a_chain;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK downgrade', t_z) RETURNING id INTO a_down;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK cycle', t_z) RETURNING id INTO a_cycle;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK revoke', t_z) RETURNING id INTO a_rev;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES ('QA ROLLBACK', t_z, v_client_agency) RETURNING id INTO v_client;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_z, a_shared, t_x, 'read_write'),
         (t_z, a_ro, t_x, 'read_only'),
         -- Written before this rule: its source t_y never held a_other.
         (t_y, a_other, t_x, 'read_write');

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  SET LOCAL ROLE authenticated;

  -- Allowed: share the tenant's own agency, re-share an agency shared with it.
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_x, a_own, t_y, 'read_write');
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_x, a_shared, t_y, 'read_write');
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_x, a_ro, t_y, 'read_only');

  -- Refused: another tenant's agency that is not shared with t_x.
  BEGIN
    INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id)
    VALUES (t_x, a_other, t_x);
    RAISE EXCEPTION 'An owner can grant itself another tenant''s agency';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id)
    VALUES (t_x, a_other, t_y);
    RAISE EXCEPTION 'An owner can share an agency not shared with its tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id)
    VALUES (t_z, a_other, t_x);
    RAISE EXCEPTION 'An owner can write a share in another tenant''s name';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
    VALUES (t_x, a_ro, t_y, 'read_write');
    RAISE EXCEPTION 'A read_only share can be passed on as read_write';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.agency_tenant_access SET agency_id = a_other
    WHERE source_tenant_id = t_x AND agency_id = a_own AND accessing_tenant_id = t_y;
    RAISE EXCEPTION 'A share can be moved to an agency the tenant does not hold';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Only the source tenant's owner updates or deletes a share.
  UPDATE public.agency_tenant_access SET access_level = 'read_write'
  WHERE source_tenant_id = t_z AND agency_id = a_ro AND accessing_tenant_id = t_x;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'The accessing tenant can upgrade its share'; END IF;
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = t_z AND agency_id = a_shared AND accessing_tenant_id = t_x;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'The accessing tenant can delete its share'; END IF;
  UPDATE public.agency_tenant_access SET notes = 'QA ROLLBACK'
  WHERE source_tenant_id = t_x AND agency_id = a_own AND accessing_tenant_id = t_y;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'The source owner cannot update its share'; END IF;
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = t_x AND agency_id = a_own AND accessing_tenant_id = t_y;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'The source owner cannot delete its share'; END IF;

  -- Revoking or downgrading a share does the same to the re-shares made from
  -- it, down the chain and around a cycle. A row outside that chain stays.
  RESET ROLE;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_z, a_chain, t_x, 'read_write'), (t_x, a_chain, t_y, 'read_write'),
         -- Written before 095300: its source t_w never held a_chain.
         (t_w, a_chain, t_x, 'read_write'),
         (t_z, a_down, t_x, 'read_write'), (t_x, a_down, t_y, 'read_write'),
         (t_y, a_down, t_w, 'read_write'),
         (t_z, a_cycle, t_x, 'read_write'), (t_x, a_cycle, t_y, 'read_write'),
         (t_y, a_cycle, t_x, 'read_write'),
         (t_z, a_rev, t_x, 'read_write'), (t_x, a_rev, t_y, 'read_write');
  UPDATE public.user_active_tenant SET tenant_id = t_z WHERE user_id = actor;
  SET LOCAL ROLE authenticated;
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = t_z AND agency_id IN (a_chain, a_cycle) AND accessing_tenant_id = t_x;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'The source owner cannot revoke its shares'; END IF;
  UPDATE public.agency_tenant_access SET access_level = 'read_only'
  WHERE source_tenant_id = t_z AND agency_id = a_down AND accessing_tenant_id = t_x;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'The source owner cannot downgrade its share'; END IF;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.agency_tenant_access
             WHERE agency_id = a_chain AND source_tenant_id = t_x) THEN
    RAISE EXCEPTION 'A re-share outlives the share it came from';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agency_tenant_access
                 WHERE agency_id = a_chain AND source_tenant_id = t_w) THEN
    RAISE EXCEPTION 'Revoking a share removed a row outside its chain';
  END IF;
  IF (SELECT count(*) FROM public.agency_tenant_access
      WHERE agency_id = a_down AND access_level = 'read_only') <> 3 THEN
    RAISE EXCEPTION 'A read_write re-share outlives the downgrade of its share';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agency_tenant_access WHERE agency_id = a_cycle) THEN
    RAISE EXCEPTION 'A share cycle outlives the share it came from';
  END IF;

  -- The agency's own tenant may revoke or downgrade any share of it, but not
  -- upgrade one it did not make; an owner of a fourth tenant may do neither.
  UPDATE public.user_active_tenant SET tenant_id = t_w WHERE user_id = actor;
  SET LOCAL ROLE authenticated;
  UPDATE public.agency_tenant_access SET access_level = 'read_only'
  WHERE source_tenant_id = t_x AND agency_id = a_rev AND accessing_tenant_id = t_y;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Another tenant''s owner can downgrade a share'; END IF;
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = t_x AND agency_id = a_rev AND accessing_tenant_id = t_y;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Another tenant''s owner can revoke a share'; END IF;
  RESET ROLE;
  UPDATE public.user_active_tenant SET tenant_id = t_z WHERE user_id = actor;
  SET LOCAL ROLE authenticated;
  UPDATE public.agency_tenant_access SET access_level = 'read_only'
  WHERE source_tenant_id = t_x AND agency_id = a_rev AND accessing_tenant_id = t_y;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'The agency''s owner cannot downgrade a re-share'; END IF;
  BEGIN
    UPDATE public.agency_tenant_access SET access_level = 'read_write'
    WHERE source_tenant_id = t_x AND agency_id = a_rev AND accessing_tenant_id = t_y;
    RAISE EXCEPTION 'The agency''s owner can upgrade a re-share it did not make';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = t_x AND agency_id = a_rev AND accessing_tenant_id = t_y;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'The agency''s owner cannot revoke a re-share'; END IF;

  -- Articles: only a read_write share that starts at the agency's tenant lets
  -- an article name the client.
  RESET ROLE;
  INSERT INTO public.publishing_sites (tenant_id, site_key, name)
  VALUES (t_x, 'qa-rollback-' || gen_random_uuid(), 'QA ROLLBACK') RETURNING id INTO v_site_x;
  INSERT INTO public.publishing_sites (tenant_id, site_key, name)
  VALUES (t_y, 'qa-rollback-' || gen_random_uuid(), 'QA ROLLBACK') RETURNING id INTO v_site_y;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_z, v_client_agency, t_x, 'read_only');
  BEGIN
    INSERT INTO public.publishing_articles (tenant_id, site_id, client_id, primary_keyword, status)
    VALUES (t_x, v_site_x, v_client, 'qa rollback', 'draft');
    RAISE EXCEPTION 'A read_only share lets an article name the client';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.agency_tenant_access SET access_level = 'read_write'
  WHERE source_tenant_id = t_z AND agency_id = v_client_agency AND accessing_tenant_id = t_x;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_x, v_client_agency, t_y, 'read_write');
  INSERT INTO public.publishing_articles (tenant_id, site_id, client_id, primary_keyword, status)
  VALUES (t_x, v_site_x, v_client, 'qa rollback', 'draft');
  INSERT INTO public.publishing_articles (tenant_id, site_id, client_id, primary_keyword, status)
  VALUES (t_y, v_site_y, v_client, 'qa rollback', 'draft');

  -- Revoking the first share also ends the re-share, and a row t_x wrote for
  -- itself does not count.
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = t_z AND agency_id = v_client_agency AND accessing_tenant_id = t_x;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_x, v_client_agency, t_x, 'read_write');
  BEGIN
    INSERT INTO public.publishing_articles (tenant_id, site_id, client_id, primary_keyword, status)
    VALUES (t_y, v_site_y, v_client, 'qa rollback', 'draft');
    RAISE EXCEPTION 'A re-share outlives the share it came from';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.publishing_articles (tenant_id, site_id, client_id, primary_keyword, status)
    VALUES (t_x, v_site_x, v_client, 'qa rollback', 'draft');
    RAISE EXCEPTION 'A share an owner wrote for itself lets an article name the client';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 20261026095200 leaves no share that gives a tenant its own agency.
  IF EXISTS (SELECT 1 FROM public.agency_tenant_access ata
             JOIN public.agencies a ON a.id = ata.agency_id
             WHERE a.tenant_id = ata.accessing_tenant_id
               AND ata.notes LIKE 'Added by the AIO-234 merge%') THEN
    RAISE EXCEPTION 'The tavnicol merge shared an agency back to its own tenant';
  END IF;
END;
$test$;
SELECT 'Agency share writes and shared-agency article clients passed' AS result;
ROLLBACK;
