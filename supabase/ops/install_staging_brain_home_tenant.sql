-- Staging: Demo Agency runs the built-in brains (Claude Direct, Cursor, Codex,
-- ChatGPT, Grok) on the project's edge secrets (AIO-600).
--
-- Built-in brain keys reach a tenant only from its own saved key, a share, or,
-- for a home tenant, the project secrets (key-source.ts). The home-tenant
-- migrations name Production organizations, so Staging had no home tenant and
-- every Claude Direct send there failed with "Claude Direct is not configured"
-- even with CLAUDE_ROUTINE_ID and CLAUDE_ROUTINE_TOKEN set on the branch.
--
-- Demo Agency exists only in the dev seed: where it is missing (Production)
-- this changes nothing. Re-running changes nothing.
-- Undo: DELETE FROM public.carmen_brain_home_tenants
--       WHERE tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
DO $staging_brain_home$
DECLARE
  v_demo_agency constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_demo_agency) THEN
    RAISE NOTICE 'staging brain home: Demo Agency (%) not found; nothing changed',
      v_demo_agency;
    RETURN;
  END IF;

  INSERT INTO public.carmen_brain_home_tenants (tenant_id)
  VALUES (v_demo_agency)
  ON CONFLICT (tenant_id) DO NOTHING;
END;
$staging_brain_home$;
