-- Carmen's phone line (AIO-511).
--
-- carmen_phone_lines: the numbers that ring Carmen, one org per number. Her
-- phone webhook (carmen-phone) finds the org of an incoming call by the number
-- that was dialled, so a number belongs to exactly one org.
--
-- carmen_phone_calls: one row per call. The webhook writes who called (team,
-- client or unknown, decided on the server), the messages Carmen took, and the
-- transcript and summary when the call ends. The phone agent's tools name the
-- call by its id; the caller's kind is read from here, never from the call.
--
-- Members of the org read both; owners manage the numbers. Only the service
-- role writes calls.

CREATE TABLE IF NOT EXISTS public.carmen_phone_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  -- The number however it was typed (972…, 0…, dashes), as public.phone_match_key reads it.
  match_key text GENERATED ALWAYS AS (public.phone_match_key(phone_number)) STORED,
  label text,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carmen_phone_lines_number_chk CHECK (match_key IS NOT NULL),
  CONSTRAINT carmen_phone_lines_match_key_key UNIQUE (match_key)
);

COMMENT ON TABLE public.carmen_phone_lines IS
  'Numbers that ring Carmen; each belongs to one org (AIO-511).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_phone_lines_updated_at
  ON public.carmen_phone_lines;
CREATE TRIGGER trg_carmen_phone_lines_updated_at
  BEFORE UPDATE ON public.carmen_phone_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_phone_lines ENABLE ROW LEVEL SECURITY;

-- Members of the org, and super admins, read its numbers.
DROP POLICY IF EXISTS carmen_phone_lines_select ON public.carmen_phone_lines;
CREATE POLICY carmen_phone_lines_select
  ON public.carmen_phone_lines
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- Owners of the org (or a super admin acting in it) add a number.
DROP POLICY IF EXISTS carmen_phone_lines_insert ON public.carmen_phone_lines;
CREATE POLICY carmen_phone_lines_insert
  ON public.carmen_phone_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.carmen_manager_is_owner(tenant_id));

-- Owners of the org (or a super admin acting in it) change a number.
DROP POLICY IF EXISTS carmen_phone_lines_update ON public.carmen_phone_lines;
CREATE POLICY carmen_phone_lines_update
  ON public.carmen_phone_lines
  FOR UPDATE TO authenticated
  USING (public.carmen_manager_is_owner(tenant_id))
  WITH CHECK (public.carmen_manager_is_owner(tenant_id));

-- Owners of the org (or a super admin acting in it) remove a number.
DROP POLICY IF EXISTS carmen_phone_lines_delete ON public.carmen_phone_lines;
CREATE POLICY carmen_phone_lines_delete
  ON public.carmen_phone_lines
  FOR DELETE TO authenticated
  USING (public.carmen_manager_is_owner(tenant_id));

REVOKE ALL ON TABLE public.carmen_phone_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carmen_phone_lines TO authenticated;
GRANT ALL ON public.carmen_phone_lines TO service_role;

CREATE TABLE IF NOT EXISTS public.carmen_phone_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.carmen_phone_lines(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'inbound',
  caller_phone text,
  caller_kind text NOT NULL,
  caller_name text,
  client_ids uuid[] NOT NULL DEFAULT '{}',
  campaigner_id uuid REFERENCES public.campaigners(id) ON DELETE SET NULL,
  elevenlabs_conversation_id text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript jsonb,
  summary text,
  summary_sent_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT carmen_phone_calls_direction_chk
    CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT carmen_phone_calls_kind_chk
    CHECK (caller_kind IN ('staff', 'client', 'unknown')),
  CONSTRAINT carmen_phone_calls_messages_chk
    CHECK (jsonb_typeof(messages) = 'array'),
  CONSTRAINT carmen_phone_calls_conversation_key
    UNIQUE (tenant_id, elevenlabs_conversation_id)
);

COMMENT ON TABLE public.carmen_phone_calls IS
  'Calls Carmen answered or made: who, messages taken, transcript and summary (AIO-511).';

CREATE INDEX IF NOT EXISTS idx_carmen_phone_calls_tenant_started
  ON public.carmen_phone_calls (tenant_id, started_at DESC);

ALTER TABLE public.carmen_phone_calls ENABLE ROW LEVEL SECURITY;

-- Members of the org, and super admins, read its calls.
DROP POLICY IF EXISTS carmen_phone_calls_select ON public.carmen_phone_calls;
CREATE POLICY carmen_phone_calls_select
  ON public.carmen_phone_calls
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin((SELECT auth.uid()))
  );

REVOKE ALL ON TABLE public.carmen_phone_calls FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.carmen_phone_calls TO authenticated;
GRANT ALL ON public.carmen_phone_calls TO service_role;
