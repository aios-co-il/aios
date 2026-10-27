-- Carmen manager round: findings store, rollout settings guard and the
-- 15-minute round cron (AIO-251; plan components C6, C7, C8 and C14).
--
-- Nothing is sent by this migration. A tenant without settings runs in
-- 'observe': the round records findings and the actions it would take, and
-- sends nothing. 'david_only' sends only to the brief recipients (default:
-- the tenant owners); 'team' routes campaigner -> manager -> owner. Messages
-- leave only through send-manus-wa-message (Carmen's own line, Staging guard).
--
-- 1. heartbeat_logs: run_kind / status / stats / llm_calls / llm_cost_usd, so
--    a round run is told apart from the Carmen heartbeat (default run_kind).
-- 2. carmen_findings: one row per live condition, deduplicated on
--    (tenant_id, kind, fingerprint) over the live statuses, with a per-tenant
--    short_code people can quote. carmen_finding_events is its audit trail,
--    carmen_finding_deliveries records every planned/sent message per
--    (finding, level, recipient) and carmen_round_state holds collector
--    watermarks, schedule slots and the per-tenant round lease.
-- 3. carmen_finding_set_status: the only browser write. Owners may dismiss and
--    rate; managers and campaigners in scope may acknowledge, snooze, resolve.
-- 4. Service-role RPCs used by carmen-manager-round: upsert, mark_missing,
--    apply_route, claim/record deliveries, brief record, lease and slots.
-- 5. Settings guard on tenant_heartbeat_settings.pulse_alert_rules.manager:
--    notify_since is stamped by the database the moment a mode (or a kind
--    override) starts sending and cleared when it stops; a writer's own value
--    is ignored, so nothing can be backdated and no stale save can replay old
--    findings. A save without a 'manager' key keeps the stored one. Only
--    owners may change the manager block from the browser, and a mode change
--    cancels the messages planned under the old mode and moves each ladder
--    back to the last level someone was actually told, to be planned again.
-- 6. Cron 'carmen-manager-round-15m' from the Vault template (skips with a
--    NOTICE when pg_cron, Vault or its secrets are missing).

-- ─── 1. heartbeat_logs run metadata ─────────────────────────────────────────

ALTER TABLE public.heartbeat_logs
  ADD COLUMN IF NOT EXISTS run_kind text NOT NULL DEFAULT 'task_heartbeat',
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS stats jsonb,
  ADD COLUMN IF NOT EXISTS llm_calls integer,
  ADD COLUMN IF NOT EXISTS llm_cost_usd numeric;

COMMENT ON COLUMN public.heartbeat_logs.run_kind IS
  'task_heartbeat (Carmen heartbeat and pulse runs) or manager_round (carmen-manager-round).';

-- ─── 2. Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.carmen_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN (
    'cost_spike', 'roas_drop', 'kpi_exception', 'no_results_spend',
    'platform_alert', 'data_gap', 'reconcile_mismatch',
    'reconcile_missing_day', 'unmapped_spend', 'unanswered_request',
    'client_complaint', 'contact_not_logged', 'no_contact',
    'card_stale_group', 'unlinked_group', 'no_campaigner', 'missing_phone'
  )),
  severity text NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  fingerprint text NOT NULL CHECK (length(fingerprint) BETWEEN 1 AND 300),
  short_code integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'notified', 'acknowledged', 'snoozed',
    'resolved', 'dismissed', 'expired', 'suppressed'
  )),
  owner_user_id uuid,
  escalation_level smallint CHECK (escalation_level BETWEEN 0 AND 2),
  ladder_started_at timestamptz,
  next_action_at timestamptz,
  routed_at timestamptz,
  source_event_at timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  missed_runs smallint NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_he text NOT NULL CHECK (length(summary_he) BETWEEN 1 AND 500),
  planned_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution text CHECK (resolution IN (
    'auto_cleared', 'fixed', 'answered', 'false_positive', 'duplicate',
    'pre_cutoff', 'converted_to_task'
  )),
  resolved_by uuid,
  resolved_at timestamptz,
  feedback text CHECK (feedback IN ('useful', 'not_useful')),
  collector text NOT NULL,
  detector_version text NOT NULL DEFAULT '1',
  round_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.carmen_findings IS
  'Carmen manager round findings: one row per live (tenant, kind, fingerprint). Written by carmen-manager-round (service role) and carmen_finding_set_status.';

-- One live row per condition; a resolved condition that returns opens a new row.
CREATE UNIQUE INDEX IF NOT EXISTS carmen_findings_live_key
  ON public.carmen_findings (tenant_id, kind, fingerprint)
  WHERE status IN ('open', 'notified', 'acknowledged', 'snoozed');

CREATE UNIQUE INDEX IF NOT EXISTS carmen_findings_short_code_key
  ON public.carmen_findings (tenant_id, short_code);

CREATE INDEX IF NOT EXISTS carmen_findings_route_idx
  ON public.carmen_findings (tenant_id, next_action_at)
  WHERE status IN ('open', 'notified', 'snoozed');

CREATE INDEX IF NOT EXISTS carmen_findings_dismissed_idx
  ON public.carmen_findings (tenant_id, kind, fingerprint, resolved_at DESC)
  WHERE status = 'dismissed';

CREATE INDEX IF NOT EXISTS carmen_findings_client_idx
  ON public.carmen_findings (client_id)
  WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.carmen_finding_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_code integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.carmen_finding_counters IS
  'Per-tenant short_code counter for carmen_findings. Service role only.';

CREATE TABLE IF NOT EXISTS public.carmen_finding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES public.carmen_findings(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN (
    'detected', 'worsened', 'notified', 'acknowledged', 'snoozed',
    'escalated', 'resolved', 'dismissed', 'feedback'
  )),
  actor_user_id uuid,
  level smallint,
  note text CHECK (note IS NULL OR length(note) <= 1000),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.carmen_finding_events IS
  'Append-only audit trail of carmen_findings (detection, sends, escalation, human actions, feedback).';

CREATE INDEX IF NOT EXISTS carmen_finding_events_finding_idx
  ON public.carmen_finding_events (finding_id, created_at);

CREATE INDEX IF NOT EXISTS carmen_finding_events_tenant_idx
  ON public.carmen_finding_events (tenant_id, event, created_at DESC);

CREATE TABLE IF NOT EXISTS public.carmen_finding_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES public.carmen_findings(id) ON DELETE CASCADE,
  level smallint NOT NULL CHECK (level BETWEEN 0 AND 2),
  recipient_key text NOT NULL,
  recipient_user_id uuid,
  recipient_name text,
  recipient_phone text,
  channel text NOT NULL CHECK (channel IN ('manus_wa', 'in_app')),
  slot text NOT NULL CHECK (slot IN ('now', 'list', 'brief')),
  status text NOT NULL CHECK (status IN (
    'planned', 'claimed', 'sent', 'delivery_unknown', 'blocked_staging',
    'duplicate_skipped', 'failed', 'no_phone', 'no_line', 'no_sender',
    'cancelled', 'expired'
  )),
  not_before timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  message_key uuid,
  provider_message_id text,
  error text,
  round_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finding_id, level, recipient_key)
);

COMMENT ON TABLE public.carmen_finding_deliveries IS
  'One row per (finding, escalation level, recipient): planned, claimed and the real send outcome from send-manus-wa-message.';

CREATE INDEX IF NOT EXISTS carmen_finding_deliveries_due_idx
  ON public.carmen_finding_deliveries (tenant_id, not_before)
  WHERE status = 'planned';

CREATE INDEX IF NOT EXISTS carmen_finding_deliveries_recipient_idx
  ON public.carmen_finding_deliveries (tenant_id, recipient_key, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.carmen_round_state (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  collector text NOT NULL,
  first_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  watermark jsonb,
  last_slot timestamptz,
  locked_until timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, collector)
);

COMMENT ON TABLE public.carmen_round_state IS
  'carmen-manager-round state per tenant: collector watermarks and slots, the brief slot, and the ''_round'' lease row. Service role only.';

DROP TRIGGER IF EXISTS carmen_findings_updated_at ON public.carmen_findings;
CREATE TRIGGER carmen_findings_updated_at
  BEFORE UPDATE ON public.carmen_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS carmen_finding_deliveries_updated_at ON public.carmen_finding_deliveries;
CREATE TRIGGER carmen_finding_deliveries_updated_at
  BEFORE UPDATE ON public.carmen_finding_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 3. Who may see and act on a finding ────────────────────────────────────

-- Owner level in a tenant: owner / agency_owner there, or a super admin
-- currently acting in that tenant (never cross-tenant).
CREATE OR REPLACE FUNCTION public.carmen_manager_is_owner(p_tenant_id uuid)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = p_tenant_id
        AND ur.role IN ('owner', 'agency_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_users AS tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = p_tenant_id
        AND tu.role IN ('owner', 'agency_owner')
    )
    OR (
      public.is_super_admin(auth.uid())
      AND public.get_effective_tenant_id() = p_tenant_id
    )
  )
$$;

REVOKE ALL ON FUNCTION public.carmen_manager_is_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_manager_is_owner(uuid) TO authenticated, service_role;

-- The caller's role for a finding: 'owner' (every finding of the tenant),
-- 'manager' (team manager of the finding's agency), 'campaigner' (assigned
-- to the client today, Israel date) or NULL (no access).
CREATE OR REPLACE FUNCTION public.carmen_finding_viewer_role(
  p_tenant_id uuid,
  p_client_id uuid,
  p_agency_id uuid
)
RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH member AS (
    SELECT ur.role::text AS role
    FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid() AND ur.tenant_id = p_tenant_id
    UNION ALL
    SELECT tu.role
    FROM public.tenant_users AS tu
    WHERE tu.user_id = auth.uid() AND tu.tenant_id = p_tenant_id
  )
  SELECT CASE
    WHEN public.carmen_manager_is_owner(p_tenant_id) THEN 'owner'
    WHEN p_agency_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM member WHERE role = 'team_manager')
      AND EXISTS (
        SELECT 1 FROM public.user_managed_agencies AS uma
        WHERE uma.user_id = auth.uid() AND uma.agency_id = p_agency_id
      ) THEN 'manager'
    WHEN p_client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM member)
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS p
        JOIN public.client_team AS ct ON ct.campaigner_id = p.campaigner_id
        WHERE p.id = auth.uid()
          AND ct.client_id = p_client_id
          AND (ct.start_date IS NULL
            OR ct.start_date <= (now() AT TIME ZONE 'Asia/Jerusalem')::date)
          AND (ct.end_date IS NULL
            OR ct.end_date >= (now() AT TIME ZONE 'Asia/Jerusalem')::date)
      ) THEN 'campaigner'
  END
$$;

REVOKE ALL ON FUNCTION public.carmen_finding_viewer_role(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_finding_viewer_role(uuid, uuid, uuid) TO authenticated, service_role;

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.carmen_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carmen_finding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carmen_finding_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carmen_finding_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carmen_round_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.carmen_findings, public.carmen_finding_events,
  public.carmen_finding_deliveries, public.carmen_finding_counters,
  public.carmen_round_state
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.carmen_findings, public.carmen_finding_events,
  public.carmen_finding_deliveries TO authenticated;
GRANT ALL ON public.carmen_findings, public.carmen_finding_events,
  public.carmen_finding_deliveries, public.carmen_finding_counters,
  public.carmen_round_state TO service_role;

-- Findings: owners see every finding of the tenant, team managers those of
-- their agencies, campaigners those of the clients assigned to them.
DROP POLICY IF EXISTS "Carmen findings visible in scope" ON public.carmen_findings;
CREATE POLICY "Carmen findings visible in scope" ON public.carmen_findings
  FOR SELECT TO authenticated
  USING (public.carmen_finding_viewer_role(tenant_id, client_id, agency_id) IS NOT NULL);

-- Events: visible exactly when their finding is visible.
DROP POLICY IF EXISTS "Carmen finding events follow the finding" ON public.carmen_finding_events;
CREATE POLICY "Carmen finding events follow the finding" ON public.carmen_finding_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.carmen_findings AS f WHERE f.id = finding_id
  ));

-- Deliveries carry phones: a recipient sees their own rows, owners see all.
DROP POLICY IF EXISTS "Carmen deliveries for recipient or owner" ON public.carmen_finding_deliveries;
CREATE POLICY "Carmen deliveries for recipient or owner" ON public.carmen_finding_deliveries
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR public.carmen_manager_is_owner(tenant_id)
  );

-- carmen_finding_counters and carmen_round_state: no policies (service role only).

-- ─── 5. Browser write: carmen_finding_set_status ────────────────────────────

-- Acknowledge, snooze (24 hours), resolve or dismiss a finding, and/or rate
-- it. Writes one event per change and cancels its planned messages when it
-- stops escalating. An unknown finding and one outside the caller's scope
-- raise the same error, so ids cannot be probed.
CREATE OR REPLACE FUNCTION public.carmen_finding_set_status(
  p_finding_id uuid,
  p_status text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_feedback text DEFAULT NULL
)
RETURNS TABLE (id uuid, status text, resolution text, feedback text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_finding public.carmen_findings%ROWTYPE;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL AND p_feedback IS NULL THEN
    RAISE EXCEPTION 'nothing_to_change' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL
     AND p_status NOT IN ('acknowledged', 'snoozed', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF p_feedback IS NOT NULL AND p_feedback NOT IN ('useful', 'not_useful') THEN
    RAISE EXCEPTION 'invalid_feedback' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_finding FROM public.carmen_findings AS f
  WHERE f.id = p_finding_id FOR UPDATE;
  v_role := CASE WHEN FOUND THEN public.carmen_finding_viewer_role(
    v_finding.tenant_id, v_finding.client_id, v_finding.agency_id) END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'finding_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (p_status = 'dismissed' OR p_feedback IS NOT NULL) AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND v_finding.status NOT IN ('open', 'notified', 'acknowledged', 'snoozed') THEN
    RAISE EXCEPTION 'finding_closed' USING ERRCODE = '22023';
  END IF;

  IF p_status IS NOT NULL THEN
    UPDATE public.carmen_findings AS f
    SET status = p_status,
        next_action_at = CASE WHEN p_status = 'snoozed'
          THEN now() + interval '24 hours' END,
        resolution = CASE p_status
          WHEN 'resolved' THEN 'fixed'
          WHEN 'dismissed' THEN 'false_positive'
          ELSE f.resolution END,
        resolved_by = CASE WHEN p_status IN ('resolved', 'dismissed')
          THEN v_uid ELSE f.resolved_by END,
        resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed')
          THEN now() ELSE f.resolved_at END
    WHERE f.id = p_finding_id;

    UPDATE public.carmen_finding_deliveries AS d
    SET status = 'cancelled'
    WHERE d.finding_id = p_finding_id AND d.status = 'planned';

    INSERT INTO public.carmen_finding_events
      (tenant_id, finding_id, event, actor_user_id, note)
    VALUES (v_finding.tenant_id, p_finding_id, p_status, v_uid, p_note);
  END IF;

  IF p_feedback IS NOT NULL THEN
    UPDATE public.carmen_findings AS f SET feedback = p_feedback
    WHERE f.id = p_finding_id;
    INSERT INTO public.carmen_finding_events
      (tenant_id, finding_id, event, actor_user_id, note, details)
    VALUES (v_finding.tenant_id, p_finding_id, 'feedback', v_uid,
      CASE WHEN p_status IS NULL THEN p_note END,
      jsonb_build_object('feedback', p_feedback));
  END IF;

  RETURN QUERY
  SELECT f.id, f.status, f.resolution, f.feedback
  FROM public.carmen_findings AS f WHERE f.id = p_finding_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carmen_finding_set_status(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_finding_set_status(uuid, text, text, text) TO authenticated, service_role;

-- ─── 6. Round RPCs (service role only) ──────────────────────────────────────

-- Upsert collector candidates. A live finding with the same
-- (tenant, kind, fingerprint) is only bumped (last_seen_at, occurrence_count,
-- latest evidence and summary; severity only rises, and a rise re-routes it).
-- A fingerprint dismissed in the last 14 days is not reopened. A client or
-- agency the tenant cannot reach (not its own, no agency access) is
-- rejected; a client's own agency always wins; an owner_user_id outside the
-- tenant is dropped (the router then picks the client's campaigner).
-- Candidate keys: kind, fingerprint, severity, client_id, agency_id,
-- source_event_at, summary_he, evidence, owner_user_id.
CREATE OR REPLACE FUNCTION public.carmen_finding_upsert(
  p_tenant_id uuid,
  p_round_id uuid,
  p_collector text,
  p_detector_version text,
  p_candidates jsonb
)
RETURNS TABLE (finding_id uuid, kind text, fingerprint text, short_code integer, outcome text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  c record;
  v_rank_new integer;
  v_existing record;
  v_agency uuid;
  v_owner uuid;
  v_code integer;
  v_id uuid;
BEGIN
  FOR c IN
    SELECT x.* FROM jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) AS x(
      kind text, fingerprint text, severity text, client_id uuid,
      agency_id uuid, source_event_at timestamptz, summary_he text,
      evidence jsonb, owner_user_id uuid)
  LOOP
    kind := c.kind;
    fingerprint := c.fingerprint;
    finding_id := NULL;
    short_code := NULL;

    IF coalesce(c.fingerprint, '') = '' OR coalesce(c.summary_he, '') = ''
       OR coalesce(c.severity, 'warning') NOT IN ('info', 'warning', 'critical') THEN
      outcome := 'invalid';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_agency := c.agency_id;
    IF c.client_id IS NOT NULL THEN
      SELECT cl.agency_id INTO v_agency
      FROM public.clients AS cl
      WHERE cl.id = c.client_id
        AND (cl.tenant_id = p_tenant_id OR EXISTS (
          SELECT 1 FROM public.agency_tenant_access AS ata
          WHERE ata.agency_id = cl.agency_id AND ata.accessing_tenant_id = p_tenant_id));
      IF NOT FOUND THEN
        outcome := 'rejected_client';
        RETURN NEXT;
        CONTINUE;
      END IF;
    ELSIF c.agency_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.agencies AS a
      WHERE a.id = c.agency_id
        AND (a.tenant_id = p_tenant_id OR EXISTS (
          SELECT 1 FROM public.agency_tenant_access AS ata
          WHERE ata.agency_id = a.id AND ata.accessing_tenant_id = p_tenant_id))
    ) THEN
      outcome := 'rejected_agency';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_owner := c.owner_user_id;
    IF v_owner IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = v_owner AND ur.tenant_id = p_tenant_id
      UNION ALL
      SELECT 1 FROM public.tenant_users AS tu
      WHERE tu.user_id = v_owner AND tu.tenant_id = p_tenant_id
    ) THEN
      v_owner := NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.carmen_findings AS f
      WHERE f.tenant_id = p_tenant_id AND f.kind = c.kind
        AND f.fingerprint = c.fingerprint AND f.status = 'dismissed'
        AND f.resolved_at > now() - interval '14 days'
    ) THEN
      outcome := 'suppressed';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_rank_new := array_position(ARRAY['info', 'warning', 'critical'], c.severity);
    SELECT f.id, f.short_code,
           array_position(ARRAY['info', 'warning', 'critical'], f.severity) AS rank
      INTO v_existing
    FROM public.carmen_findings AS f
    WHERE f.tenant_id = p_tenant_id AND f.kind = c.kind
      AND f.fingerprint = c.fingerprint
      AND f.status IN ('open', 'notified', 'acknowledged', 'snoozed')
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.carmen_findings AS f
      SET last_seen_at = now(),
          occurrence_count = f.occurrence_count + 1,
          missed_runs = 0,
          evidence = coalesce(c.evidence, f.evidence),
          summary_he = coalesce(c.summary_he, f.summary_he),
          severity = CASE WHEN v_rank_new > v_existing.rank THEN c.severity ELSE f.severity END,
          next_action_at = CASE WHEN v_rank_new > v_existing.rank THEN now() ELSE f.next_action_at END,
          detector_version = coalesce(p_detector_version, f.detector_version),
          round_id = p_round_id
      WHERE f.id = v_existing.id;
      finding_id := v_existing.id;
      short_code := v_existing.short_code;
      outcome := CASE WHEN v_rank_new > v_existing.rank THEN 'worsened' ELSE 'seen' END;
      IF outcome = 'worsened' THEN
        INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event, details)
        VALUES (p_tenant_id, v_existing.id, 'worsened',
          jsonb_build_object('severity', c.severity));
      END IF;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- A kind outside the table's list (or a concurrent insert) skips only
    -- this candidate; the counter bump rolls back with it.
    BEGIN
      INSERT INTO public.carmen_finding_counters AS fc (tenant_id, last_code)
      VALUES (p_tenant_id, 1)
      ON CONFLICT (tenant_id) DO UPDATE SET last_code = fc.last_code + 1
      RETURNING fc.last_code INTO v_code;

      INSERT INTO public.carmen_findings (
        tenant_id, client_id, agency_id, kind, severity, fingerprint, short_code,
        owner_user_id, source_event_at, evidence, summary_he, collector,
        detector_version, round_id)
      VALUES (
        p_tenant_id, c.client_id, v_agency, c.kind,
        coalesce(c.severity, 'warning'), c.fingerprint, v_code, v_owner,
        coalesce(c.source_event_at, now()), coalesce(c.evidence, '{}'::jsonb),
        c.summary_he, p_collector, coalesce(p_detector_version, '1'), p_round_id)
      RETURNING id INTO v_id;
    EXCEPTION WHEN check_violation OR unique_violation OR not_null_violation THEN
      outcome := 'invalid';
      RETURN NEXT;
      CONTINUE;
    END;

    INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event, details)
    VALUES (p_tenant_id, v_id, 'detected',
      jsonb_build_object('collector', p_collector, 'severity', coalesce(c.severity, 'warning')));

    finding_id := v_id;
    short_code := v_code;
    outcome := 'inserted';
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Count a run in which a live finding was not seen again. The scope is the
-- kind plus, when given, the clients and/or fingerprints the run covered.
-- After p_after_misses consecutive misses it is resolved as auto_cleared and
-- its planned messages are cancelled. Returns the cleared findings.
CREATE OR REPLACE FUNCTION public.carmen_finding_mark_missing(
  p_tenant_id uuid,
  p_kind text,
  p_seen text[],
  p_client_ids uuid[] DEFAULT NULL,
  p_fingerprints text[] DEFAULT NULL,
  p_after_misses integer DEFAULT 2,
  p_round_id uuid DEFAULT NULL
)
RETURNS TABLE (finding_id uuid, short_code integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_missed uuid[];
BEGIN
  WITH bumped AS (
    UPDATE public.carmen_findings AS f
    SET missed_runs = f.missed_runs + 1, round_id = p_round_id
    WHERE f.tenant_id = p_tenant_id
      AND f.kind = p_kind
      AND f.status IN ('open', 'notified', 'acknowledged', 'snoozed')
      AND NOT (f.fingerprint = ANY (coalesce(p_seen, '{}'::text[])))
      AND (p_client_ids IS NULL OR f.client_id = ANY (p_client_ids))
      AND (p_fingerprints IS NULL OR f.fingerprint = ANY (p_fingerprints))
    RETURNING f.id, f.missed_runs
  )
  SELECT coalesce(array_agg(b.id), '{}'::uuid[]) INTO v_missed
  FROM bumped AS b
  WHERE b.missed_runs >= greatest(coalesce(p_after_misses, 2), 1);

  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'cancelled'
  WHERE d.finding_id = ANY (v_missed) AND d.status = 'planned';

  RETURN QUERY
  WITH cleared AS (
    UPDATE public.carmen_findings AS f
    SET status = 'resolved', resolution = 'auto_cleared',
        resolved_at = now(), next_action_at = NULL
    WHERE f.id = ANY (v_missed)
    RETURNING f.id, f.short_code, f.tenant_id
  ), logged AS (
    INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event, details)
    SELECT cl.tenant_id, cl.id, 'resolved', '{"resolution": "auto_cleared"}'::jsonb
    FROM cleared AS cl
  )
  SELECT cl.id, cl.short_code FROM cleared AS cl;
END;
$$;

-- Apply the router's decisions in one statement: routing state on each live
-- finding of the tenant, planned delivery rows (the first plan per finding,
-- level and recipient wins, except over a row a rollout change cancelled:
-- carmen_manager_reset_ladders) and an 'escalated' event when a routed
-- finding moves above its previous level (a first routing is not an
-- escalation). Decisions for findings that stopped being live meanwhile
-- (acknowledged, resolved) are ignored.
-- Decision keys: finding_id, status, escalation_level, ladder_started_at,
-- next_action_at, owner_user_id, planned_actions, deliveries[] (level,
-- recipient_key, recipient_user_id, recipient_name, recipient_phone,
-- channel, slot, status, not_before).
CREATE OR REPLACE FUNCTION public.carmen_finding_apply_route(
  p_tenant_id uuid,
  p_round_id uuid,
  p_decisions jsonb
)
RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH decision AS (
    SELECT d.*, f.escalation_level AS previous_level
    FROM jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb)) AS d(
      finding_id uuid, status text, escalation_level smallint,
      ladder_started_at timestamptz, next_action_at timestamptz,
      owner_user_id uuid, planned_actions jsonb, deliveries jsonb)
    JOIN public.carmen_findings AS f
      ON f.id = d.finding_id
     AND f.tenant_id = p_tenant_id
     AND f.status IN ('open', 'notified', 'snoozed')
  ), routed AS (
    UPDATE public.carmen_findings AS f
    SET status = coalesce(d.status, f.status),
        escalation_level = d.escalation_level,
        ladder_started_at = coalesce(d.ladder_started_at, f.ladder_started_at),
        next_action_at = d.next_action_at,
        owner_user_id = coalesce(f.owner_user_id, d.owner_user_id),
        planned_actions = coalesce(d.planned_actions, f.planned_actions),
        routed_at = now(),
        round_id = p_round_id
    FROM decision AS d
    WHERE f.id = d.finding_id
    RETURNING f.id
  ), planned AS (
    -- DISTINCT ON: a decision may name one recipient twice at a level (a
    -- climb to level 2 plus the critical copy), and DO UPDATE refuses that.
    INSERT INTO public.carmen_finding_deliveries AS cur (
      tenant_id, finding_id, level, recipient_key, recipient_user_id,
      recipient_name, recipient_phone, channel, slot, status, not_before, round_id)
    SELECT DISTINCT ON (d.finding_id, x.level, x.recipient_key)
           p_tenant_id, d.finding_id, x.level, x.recipient_key,
           x.recipient_user_id, x.recipient_name, x.recipient_phone, x.channel,
           x.slot, x.status, coalesce(x.not_before, now()), p_round_id
    FROM decision AS d
    CROSS JOIN LATERAL jsonb_to_recordset(coalesce(d.deliveries, '[]'::jsonb)) AS x(
      level smallint, recipient_key text, recipient_user_id uuid,
      recipient_name text, recipient_phone text, channel text, slot text,
      status text, not_before timestamptz)
    ON CONFLICT (finding_id, level, recipient_key) DO UPDATE
      SET recipient_user_id = EXCLUDED.recipient_user_id,
          recipient_name = EXCLUDED.recipient_name,
          recipient_phone = EXCLUDED.recipient_phone,
          channel = EXCLUDED.channel, slot = EXCLUDED.slot,
          status = EXCLUDED.status, not_before = EXCLUDED.not_before,
          attempted_at = NULL, message_key = NULL, provider_message_id = NULL,
          error = NULL, round_id = EXCLUDED.round_id
      WHERE cur.status = 'cancelled' AND cur.error = 'rollout_changed'
    RETURNING 1
  ), escalated AS (
    INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event, level)
    SELECT p_tenant_id, d.finding_id, 'escalated', d.escalation_level
    FROM decision AS d
    WHERE d.previous_level IS NOT NULL
      AND d.escalation_level > d.previous_level
    RETURNING 1
  )
  SELECT count(*)::integer FROM routed
$$;

-- Claim the tenant's due 'now'/'list' deliveries for sending. First: a claim
-- older than 10 minutes was cut off; a row whose send had started
-- (attempted_at) becomes delivery_unknown (it may have left; never resend)
-- and a row never tried goes back to planned. Then a plan due more than 24
-- hours ago expires instead of going out late, and plans whose finding
-- stopped escalating are cancelled.
CREATE OR REPLACE FUNCTION public.carmen_finding_claim_deliveries(
  p_tenant_id uuid,
  p_limit integer DEFAULT 200
)
RETURNS SETOF public.carmen_finding_deliveries
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  UPDATE public.carmen_finding_deliveries AS d
  SET status = CASE WHEN d.attempted_at IS NULL THEN 'planned' ELSE 'delivery_unknown' END,
      error = CASE WHEN d.attempted_at IS NULL THEN d.error ELSE 'claim_timeout' END
  WHERE d.tenant_id = p_tenant_id AND d.status = 'claimed'
    AND d.updated_at < now() - interval '10 minutes';

  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'expired'
  WHERE d.tenant_id = p_tenant_id AND d.status = 'planned'
    AND d.not_before < now() - interval '24 hours';

  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'cancelled'
  FROM public.carmen_findings AS f
  WHERE d.tenant_id = p_tenant_id AND d.status = 'planned'
    AND f.id = d.finding_id
    AND f.status NOT IN ('open', 'notified', 'snoozed');

  RETURN QUERY
  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'claimed'
  WHERE d.id IN (
    SELECT q.id FROM public.carmen_finding_deliveries AS q
    WHERE q.tenant_id = p_tenant_id AND q.status = 'planned'
      AND q.slot IN ('now', 'list') AND q.not_before <= now()
    ORDER BY q.not_before, q.created_at
    LIMIT greatest(coalesce(p_limit, 200), 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.*;
END;
$$;

-- Record the outcome of one message (the claimed rows it carried). 'claimed'
-- marks the rows as being sent now (attempted_at), just before the send, so
-- a call cut off mid-send never resends them. 'planned' puts the rows back
-- with a later not_before (over the daily cap). A sent or possibly-sent
-- message writes a 'notified' event per finding.
CREATE OR REPLACE FUNCTION public.carmen_finding_record_send(
  p_tenant_id uuid,
  p_delivery_ids uuid[],
  p_status text,
  p_message_key uuid DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_not_before timestamptz DEFAULT NULL
)
RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH recorded AS (
    UPDATE public.carmen_finding_deliveries AS d
    SET status = p_status,
        not_before = CASE WHEN p_status = 'planned'
          THEN coalesce(p_not_before, d.not_before) ELSE d.not_before END,
        attempted_at = CASE WHEN p_status = 'planned' THEN d.attempted_at ELSE now() END,
        message_key = coalesce(p_message_key, d.message_key),
        provider_message_id = p_provider_message_id,
        error = left(p_error, 500)
    WHERE d.tenant_id = p_tenant_id AND d.id = ANY (p_delivery_ids)
      AND d.status = 'claimed'
    RETURNING d.tenant_id, d.finding_id, d.level, d.recipient_key
  ), notified AS (
    INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event, level, details)
    SELECT r.tenant_id, r.finding_id, 'notified', r.level,
           jsonb_build_object('recipient_key', r.recipient_key, 'status', p_status,
             'message_key', p_message_key)
    FROM recorded AS r
    WHERE p_status IN ('sent', 'delivery_unknown')
    RETURNING 1
  )
  SELECT count(*)::integer FROM recorded
$$;

-- Record a morning brief sent to one recipient: a level-2 'brief' row per
-- finding it listed. A finding already planned for that recipient at level 2
-- takes the brief's outcome, so the same item is not sent again later.
CREATE OR REPLACE FUNCTION public.carmen_finding_record_brief(
  p_tenant_id uuid,
  p_finding_ids uuid[],
  p_recipient jsonb,
  p_status text,
  p_message_key uuid,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.carmen_finding_deliveries AS d (
    tenant_id, finding_id, level, recipient_key, recipient_user_id,
    recipient_name, recipient_phone, channel, slot, status, attempted_at,
    message_key, provider_message_id, error)
  SELECT p_tenant_id, f.id, 2, p_recipient ->> 'recipient_key',
         nullif(p_recipient ->> 'recipient_user_id', '')::uuid,
         p_recipient ->> 'recipient_name', p_recipient ->> 'recipient_phone',
         'manus_wa', 'brief', p_status, now(), p_message_key,
         p_provider_message_id, left(p_error, 500)
  FROM public.carmen_findings AS f
  WHERE f.tenant_id = p_tenant_id AND f.id = ANY (p_finding_ids)
  ON CONFLICT (finding_id, level, recipient_key)
  DO UPDATE SET status = EXCLUDED.status, attempted_at = EXCLUDED.attempted_at,
    message_key = EXCLUDED.message_key,
    provider_message_id = EXCLUDED.provider_message_id, error = EXCLUDED.error
  WHERE d.status = 'planned';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_status IN ('sent', 'delivery_unknown') THEN
    INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event, level, details)
    SELECT p_tenant_id, f.id, 'notified', 2,
           jsonb_build_object('recipient_key', p_recipient ->> 'recipient_key',
             'status', p_status, 'message_key', p_message_key, 'slot', 'brief')
    FROM public.carmen_findings AS f
    WHERE f.tenant_id = p_tenant_id AND f.id = ANY (p_finding_ids);
  END IF;
  RETURN v_count;
END;
$$;

-- Per-tenant round lease on the '_round' state row, so two overlapping round
-- calls never work on the same tenant. Returns false while another holds it.
CREATE OR REPLACE FUNCTION public.carmen_round_try_lease(
  p_tenant_id uuid,
  p_seconds integer DEFAULT 300
)
RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH leased AS (
    INSERT INTO public.carmen_round_state AS s (tenant_id, collector, locked_until)
    VALUES (p_tenant_id, '_round', now() + make_interval(secs => greatest(p_seconds, 30)))
    ON CONFLICT (tenant_id, collector) DO UPDATE
      SET locked_until = EXCLUDED.locked_until, updated_at = now()
      WHERE s.locked_until IS NULL OR s.locked_until < now()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM leased)
$$;

-- End the lease and stamp the tenant's last round run.
CREATE OR REPLACE FUNCTION public.carmen_round_end_lease(
  p_tenant_id uuid,
  p_error text DEFAULT NULL
)
RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  UPDATE public.carmen_round_state
  SET locked_until = NULL, last_run_at = now(), last_error = left(p_error, 500),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND collector = '_round'
$$;

-- Claim a schedule slot (a collector's cron slot, the morning brief) once:
-- true only for the first caller with a slot later than the stored one.
CREATE OR REPLACE FUNCTION public.carmen_round_claim_slot(
  p_tenant_id uuid,
  p_key text,
  p_slot timestamptz
)
RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH claimed AS (
    INSERT INTO public.carmen_round_state AS s (tenant_id, collector, last_slot)
    VALUES (p_tenant_id, p_key, p_slot)
    ON CONFLICT (tenant_id, collector) DO UPDATE
      SET last_slot = EXCLUDED.last_slot, updated_at = now()
      WHERE s.last_slot IS NULL OR s.last_slot < EXCLUDED.last_slot
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed)
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.carmen_finding_upsert(uuid, uuid, text, text, jsonb)',
    'public.carmen_finding_mark_missing(uuid, text, text[], uuid[], text[], integer, uuid)',
    'public.carmen_finding_apply_route(uuid, uuid, jsonb)',
    'public.carmen_finding_claim_deliveries(uuid, integer)',
    'public.carmen_finding_record_send(uuid, uuid[], text, uuid, text, text, timestamptz)',
    'public.carmen_finding_record_brief(uuid, uuid[], jsonb, text, uuid, text, text)',
    'public.carmen_round_try_lease(uuid, integer)',
    'public.carmen_round_end_lease(uuid, text)',
    'public.carmen_round_claim_slot(uuid, text, timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

-- ─── 7. Manager settings guard (pulse_alert_rules.manager) ──────────────────

-- True for the modes that send (david_only, team). A missing or unknown mode
-- is 'observe' in supabase/functions/_shared/manager-round/settings.ts, so it
-- never sends; keep the two in step.
CREATE OR REPLACE FUNCTION public.carmen_manager_mode_sends(p_mode text)
RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT coalesce(p_mode, '') IN ('david_only', 'team')
$$;

-- A kind sends unless it is disabled; its own mode, when present, replaces
-- the tenant mode (an unknown override never sends).
CREATE OR REPLACE FUNCTION public.carmen_manager_kind_sends(p_kind jsonb, p_mode text)
RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_kind) = 'object' AND p_kind -> 'enabled' = 'false'::jsonb THEN false
    WHEN jsonb_typeof(p_kind) = 'object' AND p_kind ? 'mode'
      THEN public.carmen_manager_mode_sends(p_kind ->> 'mode')
    ELSE public.carmen_manager_mode_sends(p_mode)
  END
$$;

-- kinds without their notify_since stamps, to tell a settings change from a
-- stamp change.
CREATE OR REPLACE FUNCTION public.carmen_manager_kinds_without_stamps(p_kinds jsonb)
RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT CASE WHEN jsonb_typeof(p_kinds) = 'object' THEN (
    SELECT coalesce(jsonb_object_agg(k.key,
      CASE WHEN jsonb_typeof(k.value) = 'object' THEN k.value - 'notify_since' ELSE k.value END),
      '{}'::jsonb)
    FROM jsonb_each(p_kinds) AS k
  ) END
$$;

-- The manager block without its notify_since stamps: what a writer chose.
CREATE OR REPLACE FUNCTION public.carmen_manager_without_stamps(p_manager jsonb)
RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT CASE WHEN jsonb_typeof(p_manager) = 'object' THEN
    (p_manager - 'notify_since')
    || CASE WHEN jsonb_typeof(p_manager -> 'kinds') = 'object'
      THEN jsonb_build_object('kinds',
        public.carmen_manager_kinds_without_stamps(p_manager -> 'kinds'))
      ELSE '{}'::jsonb END
  ELSE '{}'::jsonb END
$$;

-- Kinds whose own switch (enabled) or mode differs between two manager blocks.
CREATE OR REPLACE FUNCTION public.carmen_manager_changed_kinds(p_old jsonb, p_new jsonb)
RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
AS $$
  SELECT coalesce(array_agg(k.key), '{}'::text[])
  FROM (
    SELECT jsonb_object_keys(CASE WHEN jsonb_typeof(p_old -> 'kinds') = 'object'
      THEN p_old -> 'kinds' ELSE '{}'::jsonb END) AS key
    UNION
    SELECT jsonb_object_keys(CASE WHEN jsonb_typeof(p_new -> 'kinds') = 'object'
      THEN p_new -> 'kinds' ELSE '{}'::jsonb END)
  ) AS k
  WHERE p_old -> 'kinds' -> k.key -> 'enabled' IS DISTINCT FROM p_new -> 'kinds' -> k.key -> 'enabled'
     OR p_old -> 'kinds' -> k.key -> 'mode' IS DISTINCT FROM p_new -> 'kinds' -> k.key -> 'mode'
$$;

-- A rollout change for the tenant (p_kinds NULL: every kind) or for some
-- kinds. Messages planned under the old rollout never go out under the new
-- one: they are cancelled as 'rollout_changed', which lets the router plan
-- them again. Each routed finding that lost a planned message, or whose
-- ladder no one has heard of yet, goes back to the highest level someone was
-- actually told or tried (below the first cancelled level; NULL when that is
-- level 0 or nobody) and is routed again at once. Otherwise the ladder would
-- move on to a manager ("not handled in time") about an item the campaigner
-- never got. Snoozed findings keep their snooze.
CREATE OR REPLACE FUNCTION public.carmen_manager_reset_ladders(
  p_tenant_id uuid,
  p_kinds text[]
)
RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH cancelled AS (
    UPDATE public.carmen_finding_deliveries AS d
    SET status = 'cancelled', error = 'rollout_changed'
    FROM public.carmen_findings AS f
    WHERE d.tenant_id = p_tenant_id AND d.status = 'planned'
      AND f.id = d.finding_id
      AND (p_kinds IS NULL OR f.kind = ANY (p_kinds))
    RETURNING d.finding_id, d.level
  ), ladder AS (
    SELECT f.id,
      (SELECT max(x.level) FROM public.carmen_finding_deliveries AS x
       WHERE x.finding_id = f.id
         AND x.status NOT IN ('planned', 'cancelled', 'expired')) AS reached,
      (SELECT min(c.level) FROM cancelled AS c WHERE c.finding_id = f.id) AS first_cancelled
    FROM public.carmen_findings AS f
    WHERE f.tenant_id = p_tenant_id
      AND f.status IN ('open', 'notified')
      AND f.escalation_level IS NOT NULL
      AND (p_kinds IS NULL OR f.kind = ANY (p_kinds))
  )
  UPDATE public.carmen_findings AS f
  SET escalation_level = CASE WHEN l.reached IS NULL OR l.first_cancelled = 0 THEN NULL
        ELSE least(f.escalation_level, l.reached, l.first_cancelled - 1) END,
      ladder_started_at = CASE WHEN l.reached IS NULL OR l.first_cancelled = 0 THEN NULL
        ELSE f.ladder_started_at END,
      next_action_at = now()
  FROM ladder AS l
  WHERE f.id = l.id AND (l.first_cancelled IS NOT NULL OR l.reached IS NULL);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.carmen_manager_settings_guard()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
  v_kinds jsonb := '{}'::jsonb;
  v_old_sends boolean;
  v_new_sends boolean;
  k record;
  v_old_kind jsonb;
  v_kind jsonb;
  v_mode_changed boolean;
  v_changed_kinds text[];
BEGIN
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.pulse_alert_rules -> 'manager') = 'object' THEN
    v_old := OLD.pulse_alert_rules -> 'manager';
  END IF;

  -- A writer that does not know the manager settings keeps the stored ones.
  IF jsonb_typeof(NEW.pulse_alert_rules) IS DISTINCT FROM 'object' THEN
    NEW.pulse_alert_rules := '{}'::jsonb;
  END IF;
  IF NOT NEW.pulse_alert_rules ? 'manager' THEN
    IF v_old = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    NEW.pulse_alert_rules := NEW.pulse_alert_rules || jsonb_build_object('manager', v_old);
  END IF;
  v_new := CASE WHEN jsonb_typeof(NEW.pulse_alert_rules -> 'manager') = 'object'
    THEN NEW.pulse_alert_rules -> 'manager' ELSE '{}'::jsonb END;

  -- The whole manager block (rollout, recipients, caps, hours, holidays) is
  -- owner-only from the browser; tenant_heartbeat_settings lets any member
  -- update the row.
  IF auth.uid() IS NOT NULL
     AND public.carmen_manager_without_stamps(v_new)
       IS DISTINCT FROM public.carmen_manager_without_stamps(v_old)
     AND NOT public.carmen_manager_is_owner(NEW.tenant_id) THEN
    RAISE EXCEPTION 'carmen_manager_settings_owner_only' USING ERRCODE = '42501';
  END IF;

  -- A tenant mode change resets every ladder of the tenant, a kind's own
  -- change those of that kind (carmen_manager_reset_ladders).
  IF TG_OP = 'UPDATE' THEN
    v_mode_changed := v_new -> 'mode' IS DISTINCT FROM v_old -> 'mode';
    v_changed_kinds := public.carmen_manager_changed_kinds(v_old, v_new);
    IF v_mode_changed OR cardinality(v_changed_kinds) > 0 THEN
      PERFORM public.carmen_manager_reset_ladders(NEW.tenant_id,
        CASE WHEN v_mode_changed THEN NULL ELSE v_changed_kinds END);
    END IF;
  END IF;

  -- notify_since: kept while the mode keeps sending, stamped now() when it
  -- starts, removed when it stops. A writer's own value is never used.
  v_old_sends := public.carmen_manager_mode_sends(v_old ->> 'mode');
  v_new_sends := public.carmen_manager_mode_sends(v_new ->> 'mode');
  v_new := v_new - 'notify_since';
  IF v_new_sends THEN
    v_new := v_new || jsonb_build_object('notify_since',
      CASE WHEN v_old_sends AND v_old ? 'notify_since'
        THEN v_old -> 'notify_since' ELSE to_jsonb(now()) END);
  END IF;

  IF jsonb_typeof(v_new -> 'kinds') = 'object' THEN
    FOR k IN SELECT * FROM jsonb_each(v_new -> 'kinds') LOOP
      v_old_kind := v_old -> 'kinds' -> k.key;
      v_old_sends := public.carmen_manager_kind_sends(v_old_kind, v_old ->> 'mode');
      v_new_sends := public.carmen_manager_kind_sends(k.value, v_new ->> 'mode');
      v_kind := CASE WHEN jsonb_typeof(k.value) = 'object'
        THEN k.value - 'notify_since' ELSE '{}'::jsonb END;
      IF v_new_sends THEN
        v_kind := v_kind || jsonb_build_object('notify_since',
          CASE WHEN v_old_sends
            THEN coalesce(v_old_kind -> 'notify_since', v_old -> 'notify_since', to_jsonb(now()))
            ELSE to_jsonb(now()) END);
      END IF;
      v_kinds := v_kinds || jsonb_build_object(k.key, v_kind);
    END LOOP;
    v_new := v_new || jsonb_build_object('kinds', v_kinds);
  END IF;

  NEW.pulse_alert_rules := NEW.pulse_alert_rules || jsonb_build_object('manager', v_new);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.carmen_manager_settings_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_manager_mode_sends(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_manager_kind_sends(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_manager_kinds_without_stamps(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_manager_without_stamps(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_manager_changed_kinds(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_manager_reset_ladders(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_manager_mode_sends(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_manager_kind_sends(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_manager_kinds_without_stamps(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_manager_without_stamps(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_manager_changed_kinds(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_manager_reset_ladders(uuid, text[]) TO service_role;

DROP TRIGGER IF EXISTS carmen_manager_settings_guard ON public.tenant_heartbeat_settings;
CREATE TRIGGER carmen_manager_settings_guard
  BEFORE INSERT OR UPDATE OF pulse_alert_rules ON public.tenant_heartbeat_settings
  FOR EACH ROW EXECUTE FUNCTION public.carmen_manager_settings_guard();

-- ─── 8. Cron: the round every 15 minutes ────────────────────────────────────

-- Off the top of the hour (07/22/37/52). The command reads the project URL and
-- service-role key from Vault at run time; nothing in git carries either.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE 'carmen-manager-round cron: pg_cron or vault not installed, skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'carmen-manager-round-15m') THEN
    RAISE NOTICE 'carmen-manager-round cron: job already exists, left unchanged';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM vault.secrets
      WHERE name IN ('project_url', 'service_role_key')) < 2 THEN
    RAISE NOTICE 'carmen-manager-round cron: vault secrets project_url / service_role_key missing, skipped';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'carmen-manager-round-15m',
    '7,22,37,52 * * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/carmen-manager-round',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      );
    $cron$
  );
END;
$$;
