-- Report WhatsApp sender line (AIO-255).
--
-- Reports, dashboard shares and meeting summaries go out from one chosen
-- WhatsApp line: a Green API phone or a Manus line (Carmen's phone) that the
-- sending tenant owns or that another tenant shared with it through
-- integration_tenant_access. Meta Cloud numbers are not report senders: they
-- need approved templates.
--
-- 1. tenant_report_settings holds the tenant's default report line. Members
--    read it; only set_report_whatsapp_sender writes it.
-- 2. report_schedules.whatsapp_integration_id is a schedule's own line. NULL
--    follows the tenant default.
-- 3. report_whatsapp_sender_usable(tenant, line, user) is the one rule for
--    "this member may send this tenant's reports from this line". Inside the
--    tenant it defers to user_has_integration_permission, the app's line
--    privacy rule. The send functions apply it to a member's own calls.
-- 4. set_report_whatsapp_sender lets tenant owners (and super admins) set the
--    default, a line every member may use.
-- 5. list_report_whatsapp_senders returns the lines a member (or a
--    schedule's creator, for the report worker) may send from, without
--    secrets.
-- 6. A trigger keeps report_schedules.created_by trusted, since the worker
--    sends as the creator: a member's insert records that member, and only
--    server code changes it later. It refuses a schedule line its creator
--    may not use, and a colleague's edit that leaves the schedule sending
--    from a line that colleague may not use. It never touches next_run_at,
--    so choosing a line never sends anything.
-- 7. report-media is a private bucket for files sent through Manus, which
--    fetches media by URL. Only the service role reads or writes it.
-- 8. Existing WhatsApp schedules are pinned to the line they always used, so
--    a tenant default set later does not move them. Only the line column
--    changes: next_run_at stays, and nothing is sent or resent.

-- 1. The tenant's default report line.
CREATE TABLE IF NOT EXISTS public.tenant_report_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp_integration_id uuid
    REFERENCES public.tenant_integrations(id) ON DELETE SET NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_report_settings IS
  'Per-tenant report delivery settings. Written only by set_report_whatsapp_sender.';
COMMENT ON COLUMN public.tenant_report_settings.whatsapp_integration_id IS
  'Default WhatsApp line (green_api or manus_wa) for reports, one every member may use: shared by another tenant, an organization line, or opened to the organization. Sends that rely on it fail while it cannot send. NULL: the only own line the sender may use, else the sender''s own Green API line. A shared line is used only when chosen.';

ALTER TABLE public.tenant_report_settings ENABLE ROW LEVEL SECURITY;

-- Members of the tenant, and super admins, may read its report settings.
DROP POLICY IF EXISTS "Tenant members read report settings"
  ON public.tenant_report_settings;
CREATE POLICY "Tenant members read report settings"
  ON public.tenant_report_settings
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin(auth.uid())
  );

REVOKE ALL ON public.tenant_report_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_report_settings TO authenticated;
GRANT ALL ON public.tenant_report_settings TO service_role;

-- 2. A schedule's own line.
ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS whatsapp_integration_id uuid
    REFERENCES public.tenant_integrations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.report_schedules.whatsapp_integration_id IS
  'WhatsApp line this schedule sends from, one its creator may use. NULL follows tenant_report_settings; deleting the line sets it NULL.';

-- 3. May p_user_id send this tenant's reports from this line? An active
-- Green API or Manus line the tenant owns or was shared. Any signed-in user
-- can write a tenant_integrations row with any tenant_id (its RLS checks only
-- user_id, AIO-245), so a row counts only when the user it belongs to is a
-- member of its tenant (or a super admin). A line another tenant shared
-- serves every member. A line of the tenant's own follows
-- user_has_integration_permission: its owner, every member for an
-- organization line (no owner) or one opened to the organization
-- (connection_visibility 'org'), the members granted it while it is shared
-- with specific users ('shared'), and super admins. A NULL p_user_id asks
-- whether every member may use the line, as the tenant default must: the
-- organization lines of that same rule.
--
-- Earlier revisions of this migration, applied on PR 963's Preview branch,
-- created the two-argument version. CREATE OR REPLACE with a new argument
-- list would keep it as an overload, so it is dropped first.
DROP FUNCTION IF EXISTS public.report_whatsapp_sender_usable(uuid, uuid);

CREATE OR REPLACE FUNCTION public.report_whatsapp_sender_usable(
  p_tenant_id uuid,
  p_integration_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_integrations AS ti
    WHERE ti.id = p_integration_id
      AND ti.integration_type IN ('green_api', 'manus_wa')
      AND public.tenant_can_use_integration(p_tenant_id, ti.id)
      AND (
        ti.user_id IS NULL
        OR public.is_super_admin(ti.user_id)
        OR EXISTS (
          SELECT 1
          FROM public.tenant_users AS tu
          WHERE tu.tenant_id = ti.tenant_id
            AND tu.user_id = ti.user_id
        )
      )
      AND (
        ti.tenant_id <> p_tenant_id
        OR CASE
          WHEN p_user_id IS NULL
            THEN (ti.user_id IS NULL OR ti.connection_visibility = 'org')
          ELSE public.user_has_integration_permission(p_user_id, ti.id)
        END
      )
  );
$$;

REVOKE ALL ON FUNCTION public.report_whatsapp_sender_usable(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_whatsapp_sender_usable(uuid, uuid, uuid)
  TO service_role;

-- Who may change a tenant's report settings: its owners and super admins.
CREATE OR REPLACE FUNCTION public.can_manage_report_settings(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND (
      public.is_super_admin(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.tenant_users AS tu
        WHERE tu.tenant_id = p_tenant_id
          AND tu.user_id = p_user_id
          AND tu.role IN ('owner', 'agency_owner')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles AS ur
        WHERE ur.tenant_id = p_tenant_id
          AND ur.user_id = p_user_id
          AND ur.role = 'owner'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_report_settings(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_report_settings(uuid, uuid)
  TO service_role;

-- 4. Sets the tenant's default report line; no line (NULL) clears it. The
-- default serves every member, so it must be a line all of them may use: a
-- private line stays its owner's.
CREATE OR REPLACE FUNCTION public.set_report_whatsapp_sender(
  p_tenant_id uuid,
  p_integration_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_manage_report_settings(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'report_settings_forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_integration_id IS NOT NULL
     AND NOT public.report_whatsapp_sender_usable(
       p_tenant_id,
       p_integration_id,
       NULL
     ) THEN
    RAISE EXCEPTION 'report_sender_not_allowed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_report_settings AS s
    (tenant_id, whatsapp_integration_id, updated_by, updated_at)
  VALUES (p_tenant_id, p_integration_id, auth.uid(), now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET whatsapp_integration_id = EXCLUDED.whatsapp_integration_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_report_whatsapp_sender(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_whatsapp_sender(uuid, uuid)
  TO authenticated, service_role;

-- 5. The lines p_user_id may send this tenant's reports from, its own lines
-- first. A member lists their own lines (p_user_id defaults to the caller
-- and may not name anyone else); the report worker (service role) passes a
-- schedule's creator. Returns labels and readiness, never api_key or any
-- part of it, because tenant_integrations rows are readable by every member.
-- last4 is the end of the instance id, to tell lines apart. org_wide marks
-- a line every member may use, the only kind the default may be. A line's
-- group_chat_ids are only the ones of this tenant's own groups: a shared
-- Carmen line is in other tenants' groups too. The one-argument version of
-- earlier revisions is dropped first: next to this one, the browser's call
-- with p_tenant_id alone would be ambiguous.
DROP FUNCTION IF EXISTS public.list_report_whatsapp_senders(uuid);

CREATE OR REPLACE FUNCTION public.list_report_whatsapp_senders(
  p_tenant_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  id uuid,
  integration_type text,
  display_name text,
  last4 text,
  owner_user_id uuid,
  owner_name text,
  owner_tenant_id uuid,
  owner_tenant_name text,
  is_shared boolean,
  org_wide boolean,
  carmen_role text,
  ready boolean,
  group_chat_ids text[],
  caller_can_manage boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF NOT v_is_service
     AND (
       p_user_id IS DISTINCT FROM auth.uid()
       OR (
         NOT public.user_is_tenant_member(p_tenant_id)
         AND NOT public.is_super_admin(auth.uid())
       )
     ) THEN
    RAISE EXCEPTION 'report_settings_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ti.id,
    ti.integration_type,
    nullif(btrim(ti.display_name), ''),
    right(
      coalesce(
        nullif(ti.instance_id, ''),
        nullif(ti.settings ->> 'instance_id', '')
      ),
      4
    ),
    ti.user_id,
    p.full_name,
    ti.tenant_id,
    t.name,
    ti.tenant_id <> p_tenant_id,
    public.report_whatsapp_sender_usable(p_tenant_id, ti.id, NULL),
    ti.settings ->> 'carmen_role',
    coalesce(ti.api_key, '') <> ''
      AND coalesce(ti.settings ->> 'instance_id', '') <> '',
    CASE
      WHEN jsonb_typeof(ti.settings #> '{manus_groups_sync,group_chat_ids}') = 'array'
      THEN ARRAY(
        SELECT chat.id
        FROM jsonb_array_elements_text(
          ti.settings #> '{manus_groups_sync,group_chat_ids}'
        ) AS chat(id)
        WHERE EXISTS (
          SELECT 1
          FROM public.whatsapp_groups AS wg
          WHERE wg.tenant_id = p_tenant_id
            AND wg.group_chat_id = chat.id
        )
      )
    END,
    public.can_manage_report_settings(p_tenant_id, auth.uid())
  FROM public.tenant_integrations AS ti
  LEFT JOIN public.profiles AS p ON p.id = ti.user_id
  LEFT JOIN public.tenants AS t ON t.id = ti.tenant_id
  -- The tenant/grant filter narrows the scan; report_whatsapp_sender_usable
  -- stays the rule that decides.
  WHERE (
      ti.tenant_id = p_tenant_id
      OR EXISTS (
        SELECT 1
        FROM public.integration_tenant_access AS ita
        WHERE ita.integration_id = ti.id
          AND ita.accessing_tenant_id = p_tenant_id
      )
    )
    AND public.report_whatsapp_sender_usable(p_tenant_id, ti.id, p_user_id)
  ORDER BY ti.tenant_id <> p_tenant_id, ti.integration_type DESC, ti.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.list_report_whatsapp_senders(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_report_whatsapp_senders(uuid, uuid)
  TO authenticated, service_role;

-- 6. The worker sends as a schedule's creator, so created_by is trusted. A
-- signed-in member's token (the browser) records that member on insert and
-- never changes it on update. Server code may set it: the service role, or
-- a session with no request token, such as a migration or auth deleting a
-- user, whose foreign key clears it.
--
-- A schedule may only name a line its creator may use. Checked when the
-- line or the tenant changes, so a line that was later switched off does
-- not stop its creator from editing it, or anyone from disabling it. The
-- worker checks the line for the creator again at every run, so a creator
-- who later loses the line is refused there.
--
-- A member editing a colleague's schedule may leave it sending WhatsApp only
-- from a line that member may use too: its own line, else the tenant
-- default. Otherwise they could put their own text and recipient on the
-- colleague's private line. Switching it off or dropping WhatsApp stays open
-- to every member. A nested update is not checked: deleting a line clears it
-- from schedules through the foreign key, and a member may always delete
-- their own line.
CREATE OR REPLACE FUNCTION public.check_report_schedule_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_token boolean :=
    coalesce(auth.jwt() ->> 'role', auth.role(), '') IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_member_token AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE NOTICE 'report_schedules %: created_by set to the member inserting it',
        NEW.id;
      NEW.created_by := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF v_member_token AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE NOTICE 'report_schedules %: created_by kept, a member may not change it',
        NEW.id;
      NEW.created_by := OLD.created_by;
    END IF;
    IF v_member_token
       AND auth.uid() IS DISTINCT FROM NEW.created_by
       AND NEW.enabled
       AND 'whatsapp' = ANY (NEW.channels) THEN
      IF pg_trigger_depth() > 1 THEN
        RAISE NOTICE 'report_schedules %: nested update, line not checked for the editing member',
          NEW.id;
      ELSIF NOT public.report_whatsapp_sender_usable(
        NEW.tenant_id,
        coalesce(
          NEW.whatsapp_integration_id,
          (
            SELECT s.whatsapp_integration_id
            FROM public.tenant_report_settings AS s
            WHERE s.tenant_id = NEW.tenant_id
          )
        ),
        auth.uid()
      ) THEN
        RAISE EXCEPTION 'report_sender_not_allowed' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.whatsapp_integration_id IS NOT DISTINCT FROM OLD.whatsapp_integration_id
       AND NEW.tenant_id = OLD.tenant_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.whatsapp_integration_id IS NOT NULL
     AND NOT public.report_whatsapp_sender_usable(
       NEW.tenant_id,
       NEW.whatsapp_integration_id,
       NEW.created_by
     ) THEN
    RAISE EXCEPTION 'report_sender_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_report_schedule_sender()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS report_schedules_check_sender ON public.report_schedules;
CREATE TRIGGER report_schedules_check_sender
  BEFORE INSERT OR UPDATE
  ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.check_report_schedule_sender();

-- 7. Private media for Manus file sends (signed URLs only, no policies).
DO $report_media$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'report-media bucket: storage schema not installed, skipped';
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit)
  VALUES ('report-media', 'report-media', false, 20971520)
  ON CONFLICT (id) DO NOTHING;
END
$report_media$;

-- 8. Pin every WhatsApp schedule without a line to the line it has always
-- sent from: its creator's single active Green API line in the schedule's
-- tenant, as send-green-api-message picked it before lines could be chosen.
-- Unpinned, such a schedule would follow a tenant default set later. Only
-- whatsapp_integration_id is set, so trg_set_report_schedule_next_run does
-- not fire and next_run_at stays; report_schedules_check_sender does fire
-- and accepts the creator's own line. Schedules whose creator has no such
-- line stay NULL and are counted in a notice: they follow the tenant default
-- or the only line their creator may use, else fail with choose_sender until
-- someone picks a line. Re-running pins only rows that are still NULL.
DO $pin_schedule_lines$
DECLARE
  v_pinned integer;
  v_unpinned integer;
  v_unpinned_enabled integer;
BEGIN
  UPDATE public.report_schedules AS rs
  SET whatsapp_integration_id = own.id
  FROM (
    SELECT ti.tenant_id, ti.user_id, (array_agg(ti.id))[1] AS id
    FROM public.tenant_integrations AS ti
    WHERE ti.integration_type = 'green_api'
      AND ti.is_active
    GROUP BY ti.tenant_id, ti.user_id
    HAVING count(*) = 1
      AND bool_and(
        coalesce(ti.api_key, '') <> ''
        AND coalesce(ti.settings ->> 'instance_id', '') <> ''
      )
  ) AS own
  WHERE rs.whatsapp_integration_id IS NULL
    AND 'whatsapp' = ANY (rs.channels)
    AND own.tenant_id = rs.tenant_id
    AND own.user_id = rs.created_by
    AND public.report_whatsapp_sender_usable(rs.tenant_id, own.id, rs.created_by);
  GET DIAGNOSTICS v_pinned = ROW_COUNT;

  SELECT count(*), count(*) FILTER (WHERE rs.enabled)
  INTO v_unpinned, v_unpinned_enabled
  FROM public.report_schedules AS rs
  WHERE rs.whatsapp_integration_id IS NULL
    AND 'whatsapp' = ANY (rs.channels);

  RAISE NOTICE 'report_schedules: pinned % WhatsApp schedules to their creator''s own line; % stay NULL, % of them enabled',
    v_pinned, v_unpinned, v_unpinned_enabled;
END
$pin_schedule_lines$;
