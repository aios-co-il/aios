-- Carmen brains: MarketingCaptain owns the project keys and shares them with
-- DMM (AIO-354).
--
-- 20261103090000_carmen_brain_key_shares made DMM the only home tenant, the
-- one organization that runs built-in brains (Cursor, Claude, Codex, ChatGPT,
-- Grok) on the project env keys. MarketingCaptain is the organization that
-- holds those keys: on Production every built-in brain use of the last 30
-- days was there. Each organization keeps its own Carmen, settings and phone;
-- only who holds the project keys changes:
--   1. MarketingCaptain becomes the home tenant;
--   2. DMM stops being one;
--   3. MarketingCaptain shares every built-in brain with DMM.
-- Environments without both organizations (Staging, Preview branches) change
-- nothing and log a NOTICE. Re-running changes nothing.
DO $$
DECLARE
  v_home constant uuid := '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019'; -- MarketingCaptain
  v_dmm constant uuid := '6ad8f321-25db-4a04-8e44-e57a7c8961b2';  -- DMM
  -- Every built-in brain: BUILTIN_BRAIN_KEYS in
  -- supabase/functions/_shared/carmen/brain-connections/builtin-keys.ts and
  -- carmen_brain_key_shares_slug_chk.
  v_slugs constant text[] := ARRAY['cursor', 'claude', 'codex', 'chatgpt', 'grok'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_home)
     OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_dmm) THEN
    RAISE NOTICE 'carmen brain home: MarketingCaptain (%) or DMM (%) not found; nothing changed',
      v_home, v_dmm;
    RETURN;
  END IF;

  -- MarketingCaptain runs built-in brains on the project keys.
  INSERT INTO public.carmen_brain_home_tenants (tenant_id)
  VALUES (v_home)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- DMM no longer does; it gets them through the shares below.
  DELETE FROM public.carmen_brain_home_tenants
  WHERE tenant_id = v_dmm;

  -- MarketingCaptain shares every built-in brain with DMM. granted_by stays
  -- NULL: this migration grants it, not a signed-in user.
  INSERT INTO public.carmen_brain_key_shares (source_tenant_id, target_tenant_id, builtin_slug)
  SELECT v_home, v_dmm, s.slug
  FROM unnest(v_slugs) AS s(slug)
  ON CONFLICT (target_tenant_id, builtin_slug) DO NOTHING;

  -- Closing guard: MarketingCaptain is home, DMM is not, and DMM gets every
  -- built-in brain from MarketingCaptain (a share from another organization
  -- would have kept its place above and fails here).
  IF NOT EXISTS (SELECT 1 FROM public.carmen_brain_home_tenants WHERE tenant_id = v_home)
     OR EXISTS (SELECT 1 FROM public.carmen_brain_home_tenants WHERE tenant_id = v_dmm)
     OR (
       SELECT count(*)
       FROM public.carmen_brain_key_shares
       WHERE source_tenant_id = v_home
         AND target_tenant_id = v_dmm
         AND builtin_slug = ANY (v_slugs)
     ) <> cardinality(v_slugs) THEN
    RAISE EXCEPTION 'carmen brain home: MarketingCaptain must be home and share every built-in brain with DMM';
  END IF;
END;
$$;
