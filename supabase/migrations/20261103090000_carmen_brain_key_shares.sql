-- Built-in brain keys: who may use the project keys, and sharing (AIO-303).
--
-- Before: any tenant without its own built-in brain key ran on the project
-- env secrets (Cursor, Claude, Codex, ChatGPT, Grok), and a tenant could save
-- only an id (e.g. a Grok webhook URL) and have it sent with the project key.
-- Now the edge functions build each built-in brain's id and key from one
-- source only:
--   1. the tenant's own complete row in carmen_brain_connections;
--   2. a share from another tenant (that tenant's own row, or the project
--      keys when it is a home tenant);
--   3. the project env secrets, only for a home tenant.
-- Otherwise the brain is not configured for that tenant.
--
-- Both tables are read and written only by edge functions (service role).

-- Tenants that run on the project env brain keys (David's org).
CREATE TABLE IF NOT EXISTS public.carmen_brain_home_tenants (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.carmen_brain_home_tenants IS
  'Tenants allowed to run built-in Carmen brains on the project env secrets (AIO-303).';

ALTER TABLE public.carmen_brain_home_tenants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.carmen_brain_home_tenants FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.carmen_brain_home_tenants TO service_role;

-- A tenant lets another tenant use one of its built-in brains' keys.
CREATE TABLE IF NOT EXISTS public.carmen_brain_key_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  builtin_slug text NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One source per brain per receiving tenant, so a send never has to choose.
  CONSTRAINT carmen_brain_key_shares_target_slug_key
    UNIQUE (target_tenant_id, builtin_slug),
  CONSTRAINT carmen_brain_key_shares_not_self_chk
    CHECK (source_tenant_id <> target_tenant_id),
  CONSTRAINT carmen_brain_key_shares_slug_chk
    CHECK (builtin_slug IN ('cursor', 'claude', 'codex', 'chatgpt', 'grok'))
);

COMMENT ON TABLE public.carmen_brain_key_shares IS
  'Built-in brain keys a tenant shares with another tenant; written only by carmen-brain-connections (AIO-303).';

CREATE INDEX IF NOT EXISTS carmen_brain_key_shares_source_idx
  ON public.carmen_brain_key_shares (source_tenant_id, builtin_slug);

ALTER TABLE public.carmen_brain_key_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.carmen_brain_key_shares FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.carmen_brain_key_shares TO service_role;

-- David's org is the home tenant in every environment that has it.
DO $$
DECLARE
  v_home constant uuid := '6ad8f321-25db-4a04-8e44-e57a7c8961b2';
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = v_home) THEN
    INSERT INTO public.carmen_brain_home_tenants (tenant_id)
    VALUES (v_home)
    ON CONFLICT (tenant_id) DO NOTHING;
  ELSE
    RAISE NOTICE 'carmen_brain_home_tenants: tenant % not found; no home tenant set', v_home;
  END IF;
END;
$$;
