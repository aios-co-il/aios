-- Client send guard, data side (AIO-261).
--
-- Goal: a client gets no automatic message unless its card opts in. The send
-- functions decide through supabase/functions/_shared/client-send/; this
-- migration gives them the setting, the classifier and the refusal log.
-- Nothing is sent, backfilled or blocked here.
--
-- 1. client_auto_send_opt_ins: one switch per card, kind and target. No row
--    means off; the client card upserts enabled true/false, so whoever turned
--    a switch off is recorded too.
--      kinds   lead_alert, campaign_alert, automation. Reports have no switch:
--              an enabled report_schedules row is their opt-in.
--      targets whatsapp_group, whatsapp_direct, email. whatsapp_direct covers
--              the card phone, the client's contacts and its approved
--              client-contact Carmen identities.
-- 2. can_manage_client_auto_sends: owners and agency owners of the client's
--    tenant, a team manager of that tenant who manages the client's agency,
--    and super admins where the tenant allows them. Campaigners, sales and SEO
--    staff who see the client, and agency read_write tenants, only read; the
--    client's own org (a child tenant) sees nothing.
--    client_auto_send_targets tells the card which targets the client has an
--    address for, the way the resolver below matches them.
-- 3. client_send_refusals: each send the guard refused (enforced) or would
--    have refused (enforced = false while a rule is observed). No phone or
--    email is stored. Only the service role writes it.
-- 4. resolve_send_recipient: the one classifier of a send address across
--    send_scope_tenant_ids (the sender, its parent, its children and agency
--    links either way). Precedence: client, client_contact, client_group,
--    then lead, then staff, then unknown.
--      phone    clients.phone, client_contacts.phone and approved
--               client-contact identities (phone_match_key), minus phones of
--               staff of the tenant that owns the card: members' profiles,
--               active campaigners and sales people, approved campaigner
--               identities. A client org's owner is therefore still a client
--               of the parent. Then leads, with the same exclusion; then staff
--               of any tenant in scope.
--      email    the same order on lower(email); identities have no email.
--      group    whatsapp_group_client_ids (AIO-242) of the scope's groups with
--               that chat id, and of the group row the sender read it from
--               (p_group_id, even outside the scope: a line shared from
--               another tenant), plus team-channel links by chat id;
--               ambiguous when several clients. Then a lead link, then a
--               campaigner's group.
--      telegram the newest message of the sender's chat naming a client or a
--               lead.
--    sender_staff says whether a phone or email is also staff of the sending
--    tenant itself: a client of a related tenant who works for the sender
--    (a client org's owner seen from that org, an agency tenant's own
--    campaigner) stays a client, and the guard lets the sender's staff
--    alerts and reports reach them.
--    It raises on a missing tenant or an unknown shape, so callers fail
--    closed. client_auto_send_allowed: is a card's switch on, for a sender in
--    scope. Both are service role only.
--
-- AIO-260's carmen_is_client_phone is not on this base; when it rebases onto
-- this migration it becomes a wrapper over resolve_send_recipient.

-- ─── 1. Opt-in setting ──────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE public.client_auto_send_kind AS ENUM (
    'lead_alert',
    'campaign_alert',
    'automation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.client_auto_send_target AS ENUM (
    'whatsapp_group',
    'whatsapp_direct',
    'email'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.client_auto_send_opt_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  send_kind public.client_auto_send_kind NOT NULL,
  target public.client_auto_send_target NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_auto_send_opt_ins_tenant_client_kind_target_key
    UNIQUE (tenant_id, client_id, send_kind, target)
);

COMMENT ON TABLE public.client_auto_send_opt_ins IS
  'Automatic sends a client card allows, per kind and target (AIO-261). No row or enabled = false: the client gets no such automatic send. tenant_id is the client''s own tenant.';

-- Keeps tenant_id the client's own, fixes client and tenant, stamps who and when.
CREATE OR REPLACE FUNCTION public.client_auto_send_opt_in_stamp()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  -- A signed-in writer who may not manage the client gets the RLS refusal
  -- before the tenant check below, which would tell whether a client id
  -- belongs to a tenant. The service role (no auth.uid()) skips it.
  IF auth.uid() IS NOT NULL
    AND NOT public.can_manage_client_auto_sends(NEW.client_id) THEN
    RAISE EXCEPTION 'new row violates row-level security policy for table "client_auto_send_opt_ins"'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'client_auto_send_opt_ins: client_id and tenant_id cannot change'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := OLD.created_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients AS c
    WHERE c.id = NEW.client_id
      AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'client_auto_send_opt_ins: tenant_id must be the client''s tenant'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_auto_send_opt_in_stamp()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS client_auto_send_opt_ins_stamp ON public.client_auto_send_opt_ins;
CREATE TRIGGER client_auto_send_opt_ins_stamp
  BEFORE INSERT OR UPDATE ON public.client_auto_send_opt_ins
  FOR EACH ROW EXECUTE FUNCTION public.client_auto_send_opt_in_stamp();

-- True when the signed-in user may change the client's switches (section 2).
CREATE OR REPLACE FUNCTION public.can_manage_client_auto_sends(p_client_id uuid)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients AS c
    JOIN public.tenants AS t ON t.id = c.tenant_id
    WHERE c.id = p_client_id
      AND (
        public.user_can_manage_client_card_entries(c.tenant_id)
        OR (
          (
            EXISTS (
              SELECT 1
              FROM public.user_roles AS ur
              WHERE ur.user_id = auth.uid()
                AND ur.tenant_id = c.tenant_id
                AND ur.role = 'team_manager'::public.app_role
            )
            OR EXISTS (
              SELECT 1
              FROM public.tenant_users AS tu
              WHERE tu.user_id = auth.uid()
                AND tu.tenant_id = c.tenant_id
                AND tu.role = 'team_manager'
            )
          )
          AND public.user_manages_agency(auth.uid(), c.agency_id)
        )
        OR (
          t.allow_super_admin_access
          AND public.is_super_admin(auth.uid())
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_client_auto_sends(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_client_auto_sends(uuid)
  TO authenticated, service_role;

-- Which switch targets the client has an address for, counted as
-- resolve_send_recipient counts them, for a user who can see the client.
CREATE OR REPLACE FUNCTION public.client_auto_send_targets(p_client_id uuid)
RETURNS TABLE (
  whatsapp_group boolean,
  whatsapp_direct boolean,
  email boolean
)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT
    c.whatsapp_group_id IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.team_channel_whatsapp_links AS l
        WHERE l.client_id = c.id
          AND (l.whatsapp_group_id IS NOT NULL OR l.whatsapp_chat_id IS NOT NULL)
      )
      OR EXISTS (
        SELECT 1
        FROM public.carmen_client_group_access AS a
        WHERE a.client_id = c.id
      ),
    public.phone_match_key(c.phone) IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.client_contacts AS cc
        WHERE cc.client_id = c.id
          AND public.phone_match_key(cc.phone) IS NOT NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.carmen_whatsapp_identities AS i
        LEFT JOIN public.client_contacts AS cc ON cc.id = i.entity_id
        WHERE coalesce(i.client_id, cc.client_id) = c.id
          AND i.entity_type = 'client_contact'
          AND i.status = 'approved'
          AND public.phone_match_key(i.phone) IS NOT NULL
      ),
    nullif(btrim(c.email), '') IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.client_contacts AS cc
        WHERE cc.client_id = c.id
          AND nullif(btrim(cc.email), '') IS NOT NULL
      )
  FROM public.clients AS c
  WHERE c.id = p_client_id
    AND public.user_can_access_client(auth.uid(), c.id)
$$;

REVOKE ALL ON FUNCTION public.client_auto_send_targets(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_auto_send_targets(uuid)
  TO authenticated, service_role;

ALTER TABLE public.client_auto_send_opt_ins ENABLE ROW LEVEL SECURITY;

-- Reads: whoever can see the client sees its switches.
DROP POLICY IF EXISTS "Users view auto-send switches of clients they can see"
  ON public.client_auto_send_opt_ins;
CREATE POLICY "Users view auto-send switches of clients they can see"
  ON public.client_auto_send_opt_ins
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_client(auth.uid(), client_id));

-- Inserts: only people who may manage the client's automatic sends.
DROP POLICY IF EXISTS "Managers add auto-send switches"
  ON public.client_auto_send_opt_ins;
CREATE POLICY "Managers add auto-send switches"
  ON public.client_auto_send_opt_ins
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_client_auto_sends(client_id));

-- Updates: the same people; the trigger keeps client and tenant fixed.
DROP POLICY IF EXISTS "Managers change auto-send switches"
  ON public.client_auto_send_opt_ins;
CREATE POLICY "Managers change auto-send switches"
  ON public.client_auto_send_opt_ins
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_client_auto_sends(client_id))
  WITH CHECK (public.can_manage_client_auto_sends(client_id));

REVOKE ALL ON TABLE public.client_auto_send_opt_ins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.client_auto_send_opt_ins TO authenticated;
GRANT ALL ON TABLE public.client_auto_send_opt_ins TO service_role;

-- ─── 2. Refusal log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_send_refusals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  channel text NOT NULL,
  recipient_kind text NOT NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE CASCADE,
  lead_id uuid,
  group_id uuid,
  send_kind text,
  send_ref text,
  subject_client_id uuid,
  reason text NOT NULL,
  enforced boolean NOT NULL
);

COMMENT ON TABLE public.client_send_refusals IS
  'Automatic sends to a client-side recipient that the client send guard refused (enforced) or would refuse (enforced = false, observed rule). tenant_id is the sending tenant; reason values come from CLIENT_SEND_REFUSALS in supabase/functions/_shared/client-send/types.ts. No phone or email is stored.';
COMMENT ON COLUMN public.client_send_refusals.client_id IS
  'The subject client when it is among the matched clients, else the first matched client.';

CREATE INDEX IF NOT EXISTS idx_client_send_refusals_client_created
  ON public.client_send_refusals (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_send_refusals_tenant_created
  ON public.client_send_refusals (tenant_id, created_at DESC);

ALTER TABLE public.client_send_refusals ENABLE ROW LEVEL SECURITY;

-- Reads: whoever can see the client sees what was refused on its behalf.
DROP POLICY IF EXISTS "Users view send refusals of clients they can see"
  ON public.client_send_refusals;
CREATE POLICY "Users view send refusals of clients they can see"
  ON public.client_send_refusals
  FOR SELECT
  TO authenticated
  USING (
    client_id IS NOT NULL
    AND public.user_can_access_client(auth.uid(), client_id)
  );

REVOKE ALL ON TABLE public.client_send_refusals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.client_send_refusals TO authenticated;
GRANT ALL ON TABLE public.client_send_refusals TO service_role;

-- ─── 3. Recipient resolution ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_client_contacts_tenant_phone_match_key
  ON public.client_contacts (tenant_id, public.phone_match_key(phone));
CREATE INDEX IF NOT EXISTS idx_leads_tenant_lower_email
  ON public.leads (tenant_id, lower(email));

-- The sender, its parent, its children and its agency-access tenants either way.
CREATE OR REPLACE FUNCTION public.send_scope_tenant_ids(p_tenant uuid)
RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT coalesce(array_agg(DISTINCT scope.tenant_id), ARRAY[]::uuid[])
  FROM (
    SELECT t.id AS tenant_id
    FROM public.tenants AS t
    WHERE t.id = p_tenant
    UNION ALL
    SELECT t.parent_tenant_id
    FROM public.tenants AS t
    WHERE t.id = p_tenant
    UNION ALL
    SELECT t.id
    FROM public.tenants AS t
    WHERE t.parent_tenant_id = p_tenant
    UNION ALL
    SELECT ata.source_tenant_id
    FROM public.agency_tenant_access AS ata
    WHERE ata.accessing_tenant_id = p_tenant
    UNION ALL
    SELECT ata.accessing_tenant_id
    FROM public.agency_tenant_access AS ata
    WHERE ata.source_tenant_id = p_tenant
  ) AS scope
  WHERE scope.tenant_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.send_scope_tenant_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_scope_tenant_ids(uuid)
  TO service_role;

-- Classifies one address (phone, email, group, telegram) of a sender (section 4).
CREATE OR REPLACE FUNCTION public.resolve_send_recipient(
  p_tenant_id uuid,
  p_shape text,
  p_address text,
  p_group_id uuid DEFAULT NULL
)
RETURNS TABLE (
  recipient_kind text,
  client_ids uuid[],
  lead_id uuid,
  group_id uuid,
  ambiguous boolean,
  sender_staff boolean
)
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
AS $$
DECLARE
  v_scope uuid[];
  v_key text;
  v_staff_tenants uuid[] := ARRAY[]::uuid[];
  v_client_ids uuid[] := ARRAY[]::uuid[];
  v_on_card boolean := false;
  v_lead uuid;
  v_group uuid;
  v_telegram_client uuid;
  v_is_staff boolean := false;
  v_sender_staff boolean := false;
  v_kind text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'resolve_send_recipient: tenant is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_scope := public.send_scope_tenant_ids(p_tenant_id);

  IF p_shape = 'phone' THEN
    v_key := public.phone_match_key(p_address);
    IF v_key IS NOT NULL THEN
      SELECT coalesce(array_agg(DISTINCT s.tenant_id), ARRAY[]::uuid[])
      INTO v_staff_tenants
      FROM (
        SELECT tu.tenant_id
        FROM public.tenant_users AS tu
        JOIN public.profiles AS p ON p.id = tu.user_id
        WHERE tu.tenant_id = ANY (v_scope)
          AND public.phone_match_key(p.phone) = v_key
        UNION ALL
        SELECT cp.tenant_id
        FROM public.campaigners AS cp
        WHERE cp.tenant_id = ANY (v_scope)
          AND cp.active
          AND public.phone_match_key(cp.phone) = v_key
        UNION ALL
        SELECT sp.tenant_id
        FROM public.sales_people AS sp
        WHERE sp.tenant_id = ANY (v_scope)
          AND sp.active
          AND public.phone_match_key(sp.phone) = v_key
        UNION ALL
        SELECT i.tenant_id
        FROM public.carmen_whatsapp_identities AS i
        WHERE i.tenant_id = ANY (v_scope)
          AND i.entity_type = 'campaigner'
          AND i.status = 'approved'
          AND public.phone_match_key(i.phone) = v_key
      ) AS s;

      SELECT
        coalesce(array_agg(DISTINCT m.client_id), ARRAY[]::uuid[]),
        coalesce(bool_or(m.on_card), false)
      INTO v_client_ids, v_on_card
      FROM (
        SELECT c.id AS client_id, c.tenant_id, true AS on_card
        FROM public.clients AS c
        WHERE c.tenant_id = ANY (v_scope)
          AND public.phone_match_key(c.phone) = v_key
        UNION ALL
        SELECT c.id, c.tenant_id, false
        FROM public.client_contacts AS cc
        JOIN public.clients AS c ON c.id = cc.client_id
        WHERE cc.tenant_id = ANY (v_scope)
          AND c.tenant_id = ANY (v_scope)
          AND public.phone_match_key(cc.phone) = v_key
        UNION ALL
        SELECT c.id, c.tenant_id, false
        FROM public.carmen_whatsapp_identities AS i
        LEFT JOIN public.client_contacts AS cc ON cc.id = i.entity_id
        JOIN public.clients AS c ON c.id = coalesce(i.client_id, cc.client_id)
        WHERE i.tenant_id = ANY (v_scope)
          AND c.tenant_id = ANY (v_scope)
          AND i.entity_type = 'client_contact'
          AND i.status = 'approved'
          AND public.phone_match_key(i.phone) = v_key
      ) AS m
      WHERE NOT (m.tenant_id = ANY (v_staff_tenants));

      SELECT l.id
      INTO v_lead
      FROM public.leads AS l
      WHERE l.tenant_id = ANY (v_scope)
        AND public.phone_match_key(l.phone) = v_key
        AND NOT (l.tenant_id = ANY (v_staff_tenants))
      ORDER BY (l.tenant_id = p_tenant_id) DESC, l.created_at DESC, l.id
      LIMIT 1;
    ELSE
      RAISE NOTICE 'resolve_send_recipient: no phone match key in the address; unknown';
    END IF;
    v_is_staff := cardinality(v_staff_tenants) > 0;
    v_sender_staff := p_tenant_id = ANY (v_staff_tenants);

  ELSIF p_shape = 'email' THEN
    v_key := nullif(lower(btrim(coalesce(p_address, ''))), '');
    IF v_key IS NOT NULL THEN
      SELECT coalesce(array_agg(DISTINCT s.tenant_id), ARRAY[]::uuid[])
      INTO v_staff_tenants
      FROM (
        SELECT tu.tenant_id
        FROM public.tenant_users AS tu
        JOIN public.profiles AS p ON p.id = tu.user_id
        WHERE tu.tenant_id = ANY (v_scope)
          AND lower(p.email) = v_key
        UNION ALL
        SELECT cp.tenant_id
        FROM public.campaigners AS cp
        WHERE cp.tenant_id = ANY (v_scope)
          AND cp.active
          AND lower(cp.email) = v_key
        UNION ALL
        SELECT sp.tenant_id
        FROM public.sales_people AS sp
        WHERE sp.tenant_id = ANY (v_scope)
          AND sp.active
          AND lower(sp.email) = v_key
      ) AS s;

      SELECT
        coalesce(array_agg(DISTINCT m.client_id), ARRAY[]::uuid[]),
        coalesce(bool_or(m.on_card), false)
      INTO v_client_ids, v_on_card
      FROM (
        SELECT c.id AS client_id, c.tenant_id, true AS on_card
        FROM public.clients AS c
        WHERE c.tenant_id = ANY (v_scope)
          AND lower(c.email) = v_key
        UNION ALL
        SELECT c.id, c.tenant_id, false
        FROM public.client_contacts AS cc
        JOIN public.clients AS c ON c.id = cc.client_id
        WHERE cc.tenant_id = ANY (v_scope)
          AND c.tenant_id = ANY (v_scope)
          AND lower(cc.email) = v_key
      ) AS m
      WHERE NOT (m.tenant_id = ANY (v_staff_tenants));

      SELECT l.id
      INTO v_lead
      FROM public.leads AS l
      WHERE l.tenant_id = ANY (v_scope)
        AND lower(l.email) = v_key
        AND NOT (l.tenant_id = ANY (v_staff_tenants))
      ORDER BY (l.tenant_id = p_tenant_id) DESC, l.created_at DESC, l.id
      LIMIT 1;
    ELSE
      RAISE NOTICE 'resolve_send_recipient: empty email address; unknown';
    END IF;
    v_is_staff := cardinality(v_staff_tenants) > 0;
    v_sender_staff := p_tenant_id = ANY (v_staff_tenants);

  ELSIF p_shape = 'group' THEN
    SELECT g.id
    INTO v_group
    FROM public.whatsapp_groups AS g
    WHERE g.group_chat_id = p_address
      AND (g.tenant_id = ANY (v_scope) OR g.id = p_group_id)
    ORDER BY (g.id = p_group_id) DESC NULLS LAST,
      (g.tenant_id = p_tenant_id) DESC, g.created_at, g.id
    LIMIT 1;

    SELECT coalesce(array_agg(DISTINCT x.client_id), ARRAY[]::uuid[])
    INTO v_client_ids
    FROM (
      SELECT ids.client_id
      FROM public.whatsapp_groups AS g
      CROSS JOIN LATERAL public.whatsapp_group_client_ids(g.id) AS ids (client_id)
      WHERE g.group_chat_id = p_address
        AND (g.tenant_id = ANY (v_scope) OR g.id = p_group_id)
      UNION ALL
      SELECT l.client_id
      FROM public.team_channel_whatsapp_links AS l
      WHERE l.whatsapp_chat_id = p_address
        AND l.tenant_id = ANY (v_scope)
        AND l.client_id IS NOT NULL
    ) AS x;

    SELECT l.lead_id
    INTO v_lead
    FROM public.team_channel_whatsapp_links AS l
    LEFT JOIN public.whatsapp_groups AS g ON g.id = l.whatsapp_group_id
    WHERE l.tenant_id = ANY (v_scope)
      AND l.lead_id IS NOT NULL
      AND (l.whatsapp_chat_id = p_address OR g.group_chat_id = p_address)
    ORDER BY l.created_at DESC NULLS LAST, l.id
    LIMIT 1;

    v_is_staff := EXISTS (
      SELECT 1
      FROM public.campaigners AS cp
      WHERE cp.tenant_id = ANY (v_scope)
        AND cp.active
        AND (cp.whatsapp_group_id = p_address
          OR cp.whatsapp_group_id || '@g.us' = p_address)
    );

  ELSIF p_shape = 'telegram' THEN
    IF p_address ~ '^-?[0-9]{1,18}$' THEN
      SELECT tm.client_id, tm.lead_id
      INTO v_telegram_client, v_lead
      FROM public.telegram_messages AS tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.chat_id = p_address::bigint
        AND (tm.client_id IS NOT NULL OR tm.lead_id IS NOT NULL)
      ORDER BY tm.created_at DESC, tm.id
      LIMIT 1;
      IF v_telegram_client IS NOT NULL THEN
        v_client_ids := ARRAY[v_telegram_client];
      END IF;
    ELSE
      RAISE NOTICE 'resolve_send_recipient: Telegram chat id is not numeric; unknown';
    END IF;

  ELSE
    RAISE EXCEPTION 'resolve_send_recipient: unknown address shape %', p_shape
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF cardinality(v_client_ids) > 0 THEN
    v_kind := CASE
      WHEN p_shape = 'group' THEN 'client_group'
      WHEN p_shape = 'telegram' OR v_on_card THEN 'client'
      ELSE 'client_contact'
    END;
    v_lead := NULL;
  ELSIF v_lead IS NOT NULL THEN
    v_kind := 'lead';
  ELSIF v_is_staff THEN
    v_kind := 'staff';
  ELSE
    v_kind := 'unknown';
  END IF;

  RETURN QUERY SELECT
    v_kind,
    v_client_ids,
    v_lead,
    v_group,
    v_kind = 'client_group' AND cardinality(v_client_ids) > 1,
    v_sender_staff;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_send_recipient(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_send_recipient(uuid, text, text, uuid)
  TO service_role;

-- True when the client is in the sender's scope and this switch is on.
CREATE OR REPLACE FUNCTION public.client_auto_send_allowed(
  p_tenant_id uuid,
  p_client_id uuid,
  p_kind public.client_auto_send_kind,
  p_target public.client_auto_send_target
)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients AS c
    JOIN public.client_auto_send_opt_ins AS o
      ON o.tenant_id = c.tenant_id
      AND o.client_id = c.id
    WHERE c.id = p_client_id
      AND c.tenant_id = ANY (public.send_scope_tenant_ids(p_tenant_id))
      AND o.send_kind = p_kind
      AND o.target = p_target
      AND o.enabled
  )
$$;

REVOKE ALL ON FUNCTION public.client_auto_send_allowed(
  uuid, uuid, public.client_auto_send_kind, public.client_auto_send_target
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_auto_send_allowed(
  uuid, uuid, public.client_auto_send_kind, public.client_auto_send_target
) TO service_role;
