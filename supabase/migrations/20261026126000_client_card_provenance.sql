-- Client card writer: provenance, idempotent server writes and real contact
-- counting (AIO-232).
--
-- Behaviour. The TypeScript callers (supabase/functions/_shared/client-card/,
-- run-ai-agent/carmen-client-card-tools.ts) have Deno tests, and
-- supabase/tests/client_card_provenance.sql checks these SQL rules on Staging:
--
-- 1. client_updates gains provenance. `source` says who wrote the row:
--      human            a person typed it in AIOS (every existing row)
--      carmen           Carmen wrote it on her own (health flags, notes)
--      carmen_confirmed Carmen wrote it because a named person asked her to;
--                       the row is attributed to that person
--      system_send      AIOS logged something it sent (report, meeting summary)
--      group_digest     a WhatsApp group summary (its writer is a follow-up)
--      automation       an automation step
--    `source_ref` is the writer's dedupe key, `counts_as_contact` an explicit
--    contact flag, `metadata` free-form context. Existing rows become
--    source='human' with NULL in the rest, so nothing about them changes.
--
-- 2. record_client_card_entry(...) is the one server-side writer. It runs as
--    the service role only and:
--      - rejects a client p_tenant may not write on (tenant_can_write_client:
--        its own client, or one of an agency shared with it read_write);
--      - returns the existing row instead of inserting when (client, source,
--        source_ref) already exists, so a retried write never duplicates;
--      - sets user_id (NOT NULL) to p_attributed_user, else the profile of the
--        client's active campaigner, else the tenant owner;
--      - refuses carmen_confirmed or counts_as_contact=true without a named
--        person, so a contact is never counted without someone to own it.
--
-- 3. get_latest_client_call_updates counts a row as client contact only when
--    its source is human or carmen_confirmed AND it is a call, a weekly update
--    whose text documents a phone call, or it carries counts_as_contact=true.
--    Rows from carmen, system_send, group_digest and automation never count.
--    Meetings keep today's baseline rule (a plain meeting row does not count)
--    until David decides otherwise. Existing rows are all 'human', so against
--    the baseline rule (calls only) the pulse's last-call dates do not move.
--    No alert or message is replayed on deploy.
--
-- 4. RLS: one shared card per client. Anyone who can see the client (its own
--    org, or an org its agency is shared with) reads every entry on it,
--    whichever org wrote it. Non-human rows are readable like any other
--    row. In the browser they can be edited or deleted only by tenant owners
--    and agency owners of the org that wrote them (the row's tenant_id);
--    campaigners keep editing and deleting their own human rows. The browser
--    may insert only human or system_send rows, as the signed-in user, in
--    their own tenant. Because every reader of the client sees every entry,
--    a browser insert or edit must also keep the row on a client the writer
--    can see.

ALTER TABLE public.client_updates
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS counts_as_contact boolean,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

DO $client_card_source_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_updates_source_check'
      AND conrelid = 'public.client_updates'::regclass
  ) THEN
    ALTER TABLE public.client_updates
      ADD CONSTRAINT client_updates_source_check CHECK (
        source IN (
          'human',
          'carmen',
          'carmen_confirmed',
          'system_send',
          'group_digest',
          'automation'
        )
      );
  END IF;
END
$client_card_source_check$;

COMMENT ON COLUMN public.client_updates.source IS
  'Who wrote the row: human, carmen, carmen_confirmed (Carmen at a named person''s request), system_send, group_digest or automation.';
COMMENT ON COLUMN public.client_updates.source_ref IS
  'Writer-supplied dedupe key; unique per (client_id, source) when set.';
COMMENT ON COLUMN public.client_updates.counts_as_contact IS
  'Explicit client-contact flag. true counts as contact for human/carmen_confirmed rows; NULL falls back to the update_type rule.';
COMMENT ON COLUMN public.client_updates.metadata IS
  'Free-form writer context (tool, requester, surface).';

-- No tenant_id: a client belongs to one tenant, so client_id pins the card and
-- a hit returns the entry already on it, even when an agency tenant wrote it.
CREATE UNIQUE INDEX IF NOT EXISTS client_updates_client_source_ref_key
  ON public.client_updates (client_id, source, source_ref)
  WHERE source_ref IS NOT NULL;

-- ─── Writer ─────────────────────────────────────────────────────────────────

-- Whether p_tenant may write on p_client: the client is p_tenant's own, or its
-- tenant shares the client's agency with p_tenant read_write. A read_only
-- share, an unknown client or a NULL argument is false. The service-role
-- writers (record_client_card_entry, Carmen's health update) check it;
-- authenticated may call it so RLS write policies can use it too.
CREATE OR REPLACE FUNCTION public.tenant_can_write_client(p_tenant uuid, p_client uuid)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients AS c
    WHERE c.id = p_client
      AND (
        c.tenant_id = p_tenant
        OR EXISTS (
          SELECT 1
          FROM public.agency_tenant_access AS ata
          WHERE ata.accessing_tenant_id = p_tenant
            AND ata.source_tenant_id = c.tenant_id
            AND ata.agency_id = c.agency_id
            AND ata.access_level = 'read_write'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.tenant_can_write_client(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_can_write_client(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_client_card_entry(
  p_tenant uuid,
  p_client uuid,
  p_content text,
  p_update_type text DEFAULT NULL,
  p_source text DEFAULT 'carmen',
  p_source_ref text DEFAULT NULL,
  p_attributed_user uuid DEFAULT NULL,
  p_counts_as_contact boolean DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS TABLE (
  entry_id uuid,
  inserted boolean,
  attributed_user_id uuid,
  attribution text
)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_content text := btrim(coalesce(p_content, ''));
  v_source text := coalesce(nullif(btrim(p_source), ''), 'carmen');
  v_ref text := nullif(btrim(p_source_ref), '');
  v_type text := nullif(btrim(p_update_type), '');
  v_user uuid;
  v_attribution text;
  v_id uuid;
BEGIN
  IF p_tenant IS NULL OR p_client IS NULL THEN
    RAISE EXCEPTION 'record_client_card_entry: tenant and client are required'
      USING ERRCODE = '22023';
  END IF;
  IF v_content = '' THEN
    RAISE EXCEPTION 'record_client_card_entry: content is required'
      USING ERRCODE = '22023';
  END IF;
  IF v_source = 'carmen_confirmed' AND p_attributed_user IS NULL THEN
    RAISE EXCEPTION 'record_client_card_entry: carmen_confirmed needs the person who confirmed it'
      USING ERRCODE = '22023';
  END IF;
  IF p_counts_as_contact IS TRUE AND p_attributed_user IS NULL THEN
    RAISE EXCEPTION 'record_client_card_entry: a contact entry needs the person who made the contact'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients AS c WHERE c.id = p_client) THEN
    RAISE EXCEPTION 'record_client_card_entry: client % not found', p_client
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.tenant_can_write_client(p_tenant, p_client) THEN
    RAISE EXCEPTION 'record_client_card_entry: client % is not in tenant %', p_client, p_tenant
      USING ERRCODE = '42501';
  END IF;

  -- Idempotent on (client, source, source_ref): a retried write returns the
  -- row it already made.
  IF v_ref IS NOT NULL THEN
    RETURN QUERY
      SELECT u.id, false, u.user_id, 'existing'::text
      FROM public.client_updates AS u
      WHERE u.client_id = p_client
        AND u.source = v_source
        AND u.source_ref = v_ref;
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Attribution: the named person, else the client's active campaigner, else
  -- the tenant owner. user_id stays NOT NULL.
  IF p_attributed_user IS NOT NULL THEN
    SELECT p.id INTO v_user FROM public.profiles AS p WHERE p.id = p_attributed_user;
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'record_client_card_entry: attributed user % has no profile', p_attributed_user
        USING ERRCODE = '22023';
    END IF;
    v_attribution := 'attributed';
  END IF;

  IF v_user IS NULL THEN
    SELECT p.id INTO v_user
    FROM public.client_team AS ct
    JOIN public.campaigners AS cp ON cp.id = ct.campaigner_id AND cp.active
    JOIN public.profiles AS p ON p.campaigner_id = cp.id
    WHERE ct.client_id = p_client
      AND (ct.start_date IS NULL OR ct.start_date <= current_date)
      AND (ct.end_date IS NULL OR ct.end_date >= current_date)
      AND p.status <> 'inactive'
    ORDER BY ct.allocation_percent DESC NULLS LAST, ct.created_at, p.created_at, p.id
    LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_attribution := 'campaigner';
    END IF;
  END IF;

  IF v_user IS NULL THEN
    SELECT owner_user.id INTO v_user
    FROM (
      SELECT p.id, 0 AS rank, ur.created_at
      FROM public.user_roles AS ur
      JOIN public.profiles AS p ON p.id = ur.user_id
      WHERE ur.tenant_id = p_tenant
        AND ur.role = 'owner'::public.app_role
      UNION ALL
      SELECT p.id, 1 AS rank, tu.created_at
      FROM public.tenant_users AS tu
      JOIN public.profiles AS p ON p.id = tu.user_id
      WHERE tu.tenant_id = p_tenant
        AND tu.role = 'owner'
    ) AS owner_user
    ORDER BY owner_user.rank, owner_user.created_at, owner_user.id
    LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_attribution := 'owner';
    END IF;
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'record_client_card_entry: no person to attribute the entry to for client %', p_client
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.client_updates AS u (
    client_id,
    tenant_id,
    user_id,
    content,
    update_type,
    source,
    source_ref,
    counts_as_contact,
    metadata
  ) VALUES (
    p_client,
    p_tenant,
    v_user,
    v_content,
    v_type,
    v_source,
    v_ref,
    p_counts_as_contact,
    p_metadata
  )
  ON CONFLICT (client_id, source, source_ref) WHERE source_ref IS NOT NULL
  DO NOTHING
  RETURNING u.id INTO v_id;

  IF v_id IS NULL THEN
    -- A concurrent writer won the race on the same source_ref.
    RETURN QUERY
      SELECT u.id, false, u.user_id, 'existing'::text
      FROM public.client_updates AS u
      WHERE u.client_id = p_client
        AND u.source = v_source
        AND u.source_ref = v_ref;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_id, true, v_user, v_attribution;
END;
$$;

REVOKE ALL ON FUNCTION public.record_client_card_entry(uuid, uuid, text, text, text, text, uuid, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_client_card_entry(uuid, uuid, text, text, text, text, uuid, boolean, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.record_client_card_entry(uuid, uuid, text, text, text, text, uuid, boolean, jsonb) IS
  'Service-role writer for client card entries: tenant check, idempotent on (client, source, source_ref), attribution to the named person, else the active campaigner, else the tenant owner.';

-- ─── Contact counting ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_latest_client_call_updates(p_client_ids uuid[])
RETURNS TABLE (
  client_id uuid,
  last_client_call_at timestamptz,
  last_client_call_by text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (updates.client_id)
    updates.client_id,
    updates.created_at AS last_client_call_at,
    COALESCE(NULLIF(profiles.full_name, ''), profiles.email) AS last_client_call_by
  FROM public.client_updates AS updates
  LEFT JOIN public.profiles AS profiles ON profiles.id = updates.user_id
  WHERE updates.client_id = ANY (p_client_ids)
    AND updates.source IN ('human', 'carmen_confirmed')
    AND (
      updates.counts_as_contact IS TRUE
      OR updates.update_type = 'call'
      OR (
        updates.update_type = 'weekly_update'
        AND public.client_update_documents_phone_call(updates.content)
      )
    )
  ORDER BY updates.client_id, updates.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_latest_client_call_updates(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_client_call_updates(uuid[])
  TO service_role;

-- ─── RLS ────────────────────────────────────────────────────────────────────

-- Tenant owners and agency owners manage entries that no person wrote.
CREATE OR REPLACE FUNCTION public.user_can_manage_client_card_entries(check_tenant_id uuid)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = check_tenant_id
        AND ur.role IN ('owner'::public.app_role, 'agency_owner'::public.app_role)
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users AS tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = check_tenant_id
        AND tu.role IN ('owner', 'agency_owner')
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_client_card_entries(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_client_card_entries(uuid)
  TO authenticated, service_role;

-- Browser inserts: as yourself, in your own tenant, on a client you can see,
-- only human or system_send rows (super admins keep the baseline bypass).
DROP POLICY IF EXISTS "Users can create client updates in their tenant" ON public.client_updates;
CREATE POLICY "Users can create client updates in their tenant"
  ON public.client_updates
  FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      tenant_id = public.get_user_tenant_id(auth.uid())
      AND user_id = auth.uid()
      AND source IN ('human', 'system_send')
      AND EXISTS (
        SELECT 1
        FROM public.clients AS c
        WHERE c.id = client_updates.client_id
      )
    )
  );

-- Reads, one shared card: a user who can see the client (own org, or an org
-- its agency is shared with) sees every entry on it, whichever org wrote it.
-- The subquery runs under the caller's own clients policies.
DROP POLICY IF EXISTS "Users view card entries of clients they can see" ON public.client_updates;
CREATE POLICY "Users view card entries of clients they can see"
  ON public.client_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients AS c
      WHERE c.id = client_updates.client_id
    )
  );

-- Updates: authors edit their own human rows; tenant and agency owners edit
-- rows no person wrote, which stay non-human. The edited row stays on a
-- client the editor can see.
DROP POLICY IF EXISTS "Users can update own client updates" ON public.client_updates;
CREATE POLICY "Users can update own client updates"
  ON public.client_updates
  FOR UPDATE
  USING (
    (source = 'human' AND user_id = auth.uid())
    OR (
      source <> 'human'
      AND public.user_can_manage_client_card_entries(tenant_id)
    )
  )
  WITH CHECK (
    (
      (source = 'human' AND user_id = auth.uid())
      OR (
        source <> 'human'
        AND public.user_can_manage_client_card_entries(tenant_id)
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.clients AS c
      WHERE c.id = client_updates.client_id
    )
  );

-- Deletes: authors delete their own human rows; tenant and agency owners
-- delete rows no person wrote.
DROP POLICY IF EXISTS "Users can delete own client updates" ON public.client_updates;
CREATE POLICY "Users can delete own client updates"
  ON public.client_updates
  FOR DELETE
  USING (
    (source = 'human' AND user_id = auth.uid())
    OR (
      source <> 'human'
      AND public.user_can_manage_client_card_entries(tenant_id)
    )
  );
