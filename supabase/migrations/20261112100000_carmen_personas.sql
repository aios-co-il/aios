-- Carmen personas (AIO-570): the assistant characters a user can work with.
--
-- Carmen, Mini Me and AIOS are built in and defined in the app
-- (src/components/carmen/personas/carmenPersonas.ts); a row with their builtin_key stores an org's
-- edits to one of them. Users also create their own characters: a row with
-- owner_user_id is theirs alone, and a row without one is shared with the org.
-- Each character has a name, the words that call it, an intro line, a look,
-- and its mood, soul, personality and writing style.
--
-- carmen_persona_choices holds the character each user picked in each org.
-- No row means the user has not picked one and the app keeps today's default.
--
-- Members of the org read and edit its shared characters and their own (the
-- same reach ai_agents_tenant_rw gives over Carmen's profile today); nobody
-- reads another user's own characters or another org's. Each user writes only
-- their own choice. Step 1 is UI only: no edge function reads these tables yet.

CREATE TABLE IF NOT EXISTS public.carmen_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  builtin_key text,
  display_name text NOT NULL,
  call_words text[] NOT NULL DEFAULT '{}',
  intro_line text,
  look text NOT NULL DEFAULT 'orbs',
  mood text,
  personality text,
  soul text,
  writing_style text,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carmen_personas_name_chk
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  CONSTRAINT carmen_personas_look_chk
    CHECK (look IN ('orbs', 'minime', 'character')),
  CONSTRAINT carmen_personas_mood_chk
    CHECK (mood IS NULL OR mood IN ('fun', 'focused', 'tired', 'angry', 'random')),
  CONSTRAINT carmen_personas_builtin_chk
    CHECK (builtin_key IS NULL OR (builtin_key IN ('carmen', 'minime', 'aios') AND owner_user_id IS NULL)),
  CONSTRAINT carmen_personas_call_words_chk
    CHECK (cardinality(call_words) <= 10)
);

-- One stored edit per built-in character per org.
CREATE UNIQUE INDEX IF NOT EXISTS carmen_personas_tenant_builtin_key
  ON public.carmen_personas (tenant_id, builtin_key)
  WHERE builtin_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS carmen_personas_tenant_owner_idx
  ON public.carmen_personas (tenant_id, owner_user_id);

COMMENT ON TABLE public.carmen_personas IS
  'Assistant characters: org edits of the built-ins (builtin_key), shared characters, and users'' own (owner_user_id) (AIO-570).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_personas_updated_at ON public.carmen_personas;
CREATE TRIGGER trg_carmen_personas_updated_at
  BEFORE UPDATE ON public.carmen_personas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_personas ENABLE ROW LEVEL SECURITY;

-- Members read the org's shared characters and their own; super admins read all.
DROP POLICY IF EXISTS carmen_personas_select ON public.carmen_personas;
CREATE POLICY carmen_personas_select
  ON public.carmen_personas
  FOR SELECT TO authenticated
  USING (
    (public.user_is_tenant_member(tenant_id)
      AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid())))
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- Members add a shared character or one of their own, never one for another user.
DROP POLICY IF EXISTS carmen_personas_insert ON public.carmen_personas;
CREATE POLICY carmen_personas_insert
  ON public.carmen_personas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_is_tenant_member(tenant_id)
    AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()))
  );

-- Members edit shared characters and their own, and cannot hand one to another user.
DROP POLICY IF EXISTS carmen_personas_update ON public.carmen_personas;
CREATE POLICY carmen_personas_update
  ON public.carmen_personas
  FOR UPDATE TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    public.user_is_tenant_member(tenant_id)
    AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()))
  );

-- Members remove shared characters and their own.
DROP POLICY IF EXISTS carmen_personas_delete ON public.carmen_personas;
CREATE POLICY carmen_personas_delete
  ON public.carmen_personas
  FOR DELETE TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    AND (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()))
  );

REVOKE ALL ON TABLE public.carmen_personas FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carmen_personas TO authenticated;
GRANT ALL ON public.carmen_personas TO service_role;

CREATE TABLE IF NOT EXISTS public.carmen_persona_choices (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A built-in key (carmen, minime, aios) or a carmen_personas id.
  persona_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT carmen_persona_choices_key_chk
    CHECK (char_length(persona_key) BETWEEN 1 AND 64)
);

COMMENT ON TABLE public.carmen_persona_choices IS
  'The assistant character each user picked in each org; no row keeps the default (AIO-570).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_persona_choices_updated_at ON public.carmen_persona_choices;
CREATE TRIGGER trg_carmen_persona_choices_updated_at
  BEFORE UPDATE ON public.carmen_persona_choices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_persona_choices ENABLE ROW LEVEL SECURITY;

-- Each user reads their own choice in orgs they belong to.
DROP POLICY IF EXISTS carmen_persona_choices_select ON public.carmen_persona_choices;
CREATE POLICY carmen_persona_choices_select
  ON public.carmen_persona_choices
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.user_is_tenant_member(tenant_id));

-- Each user records their own choice in an org they belong to.
DROP POLICY IF EXISTS carmen_persona_choices_insert ON public.carmen_persona_choices;
CREATE POLICY carmen_persona_choices_insert
  ON public.carmen_persona_choices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.user_is_tenant_member(tenant_id));

-- Each user changes their own choice, within the same org.
DROP POLICY IF EXISTS carmen_persona_choices_update ON public.carmen_persona_choices;
CREATE POLICY carmen_persona_choices_update
  ON public.carmen_persona_choices
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.user_is_tenant_member(tenant_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.user_is_tenant_member(tenant_id));

-- Each user clears their own choice.
DROP POLICY IF EXISTS carmen_persona_choices_delete ON public.carmen_persona_choices;
CREATE POLICY carmen_persona_choices_delete
  ON public.carmen_persona_choices
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.carmen_persona_choices FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carmen_persona_choices TO authenticated;
GRANT ALL ON public.carmen_persona_choices TO service_role;
