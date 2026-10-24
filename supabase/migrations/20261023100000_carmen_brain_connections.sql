-- Carmen brain connections (AIO-210).
--
-- One row per brain a tenant connects from the UI:
--   kind = 'chat_model' — any OpenAI-compatible chat API (OpenAI, Anthropic,
--                         Gemini, xAI, OpenRouter, custom). Gets its own
--                         agent_brain_routes row (route_type 'model').
--   kind = 'builtin'    — a key for a built-in brain (cursor, claude, codex,
--                         chatgpt, grok) that overrides the env secret.
--
-- The API key lives in Supabase Vault. The table holds only the Vault id and
-- the last 4 characters; browsers cannot read secret_id, and only the
-- service role may call the secret functions below.

CREATE TABLE IF NOT EXISTS public.carmen_brain_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  provider_preset text,
  base_url text,
  model text,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_id uuid,
  key_last4 text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carmen_brain_connections_tenant_slug_key UNIQUE (tenant_id, slug),
  CONSTRAINT carmen_brain_connections_kind_chk
    CHECK (kind IN ('chat_model', 'builtin')),
  CONSTRAINT carmen_brain_connections_profile_chk
    CHECK (jsonb_typeof(profile) = 'object'),
  CONSTRAINT carmen_brain_connections_settings_chk
    CHECK (jsonb_typeof(settings) = 'object'),
  CONSTRAINT carmen_brain_connections_slug_chk
    CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,47}$')
);

COMMENT ON TABLE public.carmen_brain_connections IS
  'Brains connected from Carmen settings. Keys are in Vault (secret_id); written only by the carmen-brain-connections edge function.';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_brain_connections_updated_at
  ON public.carmen_brain_connections;
CREATE TRIGGER trg_carmen_brain_connections_updated_at
  BEFORE UPDATE ON public.carmen_brain_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_brain_connections ENABLE ROW LEVEL SECURITY;

-- Members of the tenant (or super admins) can read its connections; secret_id
-- stays hidden by the column grant below.
DROP POLICY IF EXISTS "Tenant members can view brain connections"
  ON public.carmen_brain_connections;
CREATE POLICY "Tenant members can view brain connections"
  ON public.carmen_brain_connections
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_effective_tenant_id()
    OR public.is_super_admin(auth.uid())
  );

-- Browsers may read every column except secret_id, and may not write.
REVOKE ALL ON TABLE public.carmen_brain_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, tenant_id, slug, name, kind, provider_preset, base_url, model,
  profile, settings, key_last4, created_by, created_at, updated_at
) ON public.carmen_brain_connections TO authenticated;
GRANT ALL ON TABLE public.carmen_brain_connections TO service_role;

-- Brain routes are now written only by edge functions (service role).
-- No client code inserts or updates them.
DROP POLICY IF EXISTS "Tenant members can insert brain routes"
  ON public.agent_brain_routes;

DROP POLICY IF EXISTS "Tenant members can update brain routes"
  ON public.agent_brain_routes;

-- Vault helpers (service role only).

CREATE OR REPLACE FUNCTION public.carmen_brain_secret_set(
  p_connection_id uuid,
  p_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF p_secret IS NULL OR length(btrim(p_secret)) = 0 THEN
    RAISE EXCEPTION 'secret is empty';
  END IF;

  SELECT secret_id INTO v_secret_id
  FROM public.carmen_brain_connections
  WHERE id = p_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'brain connection % not found', p_connection_id;
  END IF;

  IF v_secret_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_secret_id) THEN
    PERFORM vault.update_secret(v_secret_id, btrim(p_secret));
  ELSE
    v_secret_id := vault.create_secret(
      btrim(p_secret),
      'carmen_brain_' || p_connection_id::text || '_' || extract(epoch FROM clock_timestamp())::bigint::text,
      'Carmen brain connection key'
    );
  END IF;

  UPDATE public.carmen_brain_connections
  SET secret_id = v_secret_id,
      key_last4 = right(btrim(p_secret), 4)
  WHERE id = p_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carmen_brain_secret_get(p_connection_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT ds.decrypted_secret
  FROM public.carmen_brain_connections c
  JOIN vault.decrypted_secrets ds ON ds.id = c.secret_id
  WHERE c.id = p_connection_id;
$$;

CREATE OR REPLACE FUNCTION public.carmen_brain_secret_delete(p_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT secret_id INTO v_secret_id
  FROM public.carmen_brain_connections
  WHERE id = p_connection_id
  FOR UPDATE;

  UPDATE public.carmen_brain_connections
  SET secret_id = NULL, key_last4 = NULL
  WHERE id = p_connection_id;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$;

-- Deleting a connection also deletes its Vault secret.
CREATE OR REPLACE FUNCTION public.carmen_brain_connections_drop_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF OLD.secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.secret_id;
  END IF;
  RETURN OLD;
END;
$$;

-- Deleting a connection deletes its Vault key.
DROP TRIGGER IF EXISTS trg_carmen_brain_connections_drop_secret
  ON public.carmen_brain_connections;
CREATE TRIGGER trg_carmen_brain_connections_drop_secret
  AFTER DELETE ON public.carmen_brain_connections
  FOR EACH ROW EXECUTE FUNCTION public.carmen_brain_connections_drop_secret();

-- Only the service role (edge functions) may touch keys.
REVOKE ALL ON FUNCTION public.carmen_brain_secret_set(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_brain_secret_get(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_brain_secret_delete(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_brain_connections_drop_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_brain_secret_set(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_brain_secret_get(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_brain_secret_delete(uuid) TO service_role;
