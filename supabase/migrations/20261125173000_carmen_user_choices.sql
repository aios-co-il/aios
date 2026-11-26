-- Carmen user choices (AIO-652): the brain and the voice each user picked in each org.
--
-- Until now the picked brain and voice lived only in the browser's
-- localStorage, so a pick on one device reached no other device. This table
-- stores them on the server, one row per user per org. The web reads it,
-- writes it and follows changes through Realtime; the Chrome extension, the
-- Android app and the WhatsApp lines connect to the same rows in later changes.
--
-- No row means no picks. brain_slug is the agent_brain_routes.slug the user
-- picked (NULL = Carmen's default brain) and voice is the picked voice key
-- (NULL = Carmen's configured voice). Neither is a foreign key: a pick that is
-- stale, inactive or no longer granted is read as no pick by the server
-- (supabase/functions/run-ai-agent/stored-brain-pick.ts). A client upserts on
-- (tenant_id, user_id) with only the column it changes, so one pick never
-- overwrites the other, and clears a pick by writing NULL to its column.
--
-- Each user reads and writes only their own row, in an org they belong to. A
-- super admin also reads their own row in every org, and writes it in the org
-- they act in (get_user_tenant_id), as TENANT_ISOLATION.md asks of every write
-- policy. Nobody reads another user's row.
--
-- Signed-in users hold no DELETE: no client deletes a row, and Realtime sends a
-- DELETE event, which carries the primary key (tenant_id, user_id), to every
-- subscriber without applying row-level security. A row goes only with its org
-- or its user (ON DELETE CASCADE).
--
-- Triggers fired: trg_carmen_user_choices_updated_at on each UPDATE of this
-- table. No existing row or table changes. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.carmen_user_choices (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The agent_brain_routes.slug the user picked; NULL keeps Carmen's default brain.
  brain_slug text,
  -- An OpenAI Realtime voice id or an ElevenLabs voice key; NULL keeps Carmen's configured voice.
  voice text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT carmen_user_choices_brain_slug_chk
    CHECK (brain_slug IS NULL OR char_length(brain_slug) BETWEEN 1 AND 64),
  CONSTRAINT carmen_user_choices_voice_chk
    CHECK (voice IS NULL OR char_length(voice) BETWEEN 1 AND 64)
);

COMMENT ON TABLE public.carmen_user_choices IS
  'The Carmen brain and voice each user picked in each org; no row, or a NULL column, keeps Carmen''s default (AIO-652).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_user_choices_updated_at ON public.carmen_user_choices;
CREATE TRIGGER trg_carmen_user_choices_updated_at
  BEFORE UPDATE ON public.carmen_user_choices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_user_choices ENABLE ROW LEVEL SECURITY;

-- Each user reads their own picks in an org they belong to; a super admin reads their own in every org.
DROP POLICY IF EXISTS carmen_user_choices_select ON public.carmen_user_choices;
CREATE POLICY carmen_user_choices_select
  ON public.carmen_user_choices
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.user_is_tenant_member(tenant_id)
      OR public.is_super_admin((SELECT auth.uid()))
    )
  );

-- Each user records their own picks in an org they belong to; a super admin in the org they act in.
DROP POLICY IF EXISTS carmen_user_choices_insert ON public.carmen_user_choices;
CREATE POLICY carmen_user_choices_insert
  ON public.carmen_user_choices
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      public.user_is_tenant_member(tenant_id)
      OR (
        public.is_super_admin((SELECT auth.uid()))
        AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      )
    )
  );

-- Each user changes their own picks, which stay theirs and in an org they may write in.
DROP POLICY IF EXISTS carmen_user_choices_update ON public.carmen_user_choices;
CREATE POLICY carmen_user_choices_update
  ON public.carmen_user_choices
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.user_is_tenant_member(tenant_id)
      OR (
        public.is_super_admin((SELECT auth.uid()))
        AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      public.user_is_tenant_member(tenant_id)
      OR (
        public.is_super_admin((SELECT auth.uid()))
        AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      )
    )
  );

-- authenticated is revoked first: the default privileges of the public schema give it every command.
REVOKE ALL ON TABLE public.carmen_user_choices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.carmen_user_choices TO authenticated;
GRANT ALL ON public.carmen_user_choices TO service_role;

-- Realtime: an open session follows a pick made in another tab or on another device.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'carmen_user_choices: publication supabase_realtime does not exist; the table was not added to it';
  ELSIF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'carmen_user_choices'
  ) THEN
    RAISE NOTICE 'carmen_user_choices: already in publication supabase_realtime';
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.carmen_user_choices;
  END IF;
END
$$;
