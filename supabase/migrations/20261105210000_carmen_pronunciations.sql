-- Carmen's pronunciation dictionary for her live voice (AIO-414).
--
-- One row per term an org wants said a certain way: a name, a customer, an
-- English word. carmen-realtime-session reads the org's rows into the voice
-- instructions at the start of every call. When a user corrects her mid-call,
-- the voice model calls save_pronunciation and the client (Command Center or
-- the Android app) upserts the row as that user, so RLS applies.
--
-- Members of the org read and write its dictionary; edge functions read it
-- with the service role.

CREATE TABLE IF NOT EXISTS public.carmen_pronunciations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  term text NOT NULL,
  -- The same term however it was typed or cased, so a correction replaces the old entry.
  term_key text GENERATED ALWAYS AS (lower(btrim(term))) STORED,
  spoken text NOT NULL,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carmen_pronunciations_term_chk
    CHECK (char_length(btrim(term)) BETWEEN 1 AND 80),
  CONSTRAINT carmen_pronunciations_spoken_chk
    CHECK (char_length(btrim(spoken)) BETWEEN 1 AND 160),
  CONSTRAINT carmen_pronunciations_tenant_term_key UNIQUE (tenant_id, term_key)
);

COMMENT ON TABLE public.carmen_pronunciations IS
  'How Carmen''s voice says an org''s terms; she adds rows when corrected (AIO-414).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_pronunciations_updated_at
  ON public.carmen_pronunciations;
CREATE TRIGGER trg_carmen_pronunciations_updated_at
  BEFORE UPDATE ON public.carmen_pronunciations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_pronunciations ENABLE ROW LEVEL SECURITY;

-- Members of the org, and super admins, read its dictionary.
DROP POLICY IF EXISTS carmen_pronunciations_select ON public.carmen_pronunciations;
CREATE POLICY carmen_pronunciations_select
  ON public.carmen_pronunciations
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- Members of the org add a term (any member may correct Carmen).
DROP POLICY IF EXISTS carmen_pronunciations_insert ON public.carmen_pronunciations;
CREATE POLICY carmen_pronunciations_insert
  ON public.carmen_pronunciations
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_member(tenant_id));

-- Members of the org change a term's pronunciation, within their org.
DROP POLICY IF EXISTS carmen_pronunciations_update ON public.carmen_pronunciations;
CREATE POLICY carmen_pronunciations_update
  ON public.carmen_pronunciations
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_member(tenant_id))
  WITH CHECK (public.user_is_tenant_member(tenant_id));

-- Members of the org remove a term.
DROP POLICY IF EXISTS carmen_pronunciations_delete ON public.carmen_pronunciations;
CREATE POLICY carmen_pronunciations_delete
  ON public.carmen_pronunciations
  FOR DELETE TO authenticated
  USING (public.user_is_tenant_member(tenant_id));

REVOKE ALL ON TABLE public.carmen_pronunciations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carmen_pronunciations TO authenticated;
GRANT ALL ON public.carmen_pronunciations TO service_role;
