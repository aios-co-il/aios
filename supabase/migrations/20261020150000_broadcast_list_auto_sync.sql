-- Auto-synced mailing lists, kept in the database so every change counts:
-- a lead / client is added to a synced list when it starts matching the list's
-- CRM filter and removed when it stops — whether the change came from the UI,
-- an import, a webhook or an automation, and including agency, sales person,
-- campaigner (client_team), archive and tag changes.
--
-- A list is synced when source = 'crm_filter', kind = 'static' and
-- source_config.auto_sync = true. When the list also has an automation
-- (source_config.sync_automation_id), turning that automation off pauses the
-- sync. Matching mirrors entityMatchesFilter in
-- supabase/functions/_shared/broadcast/audience/entity-match.ts.

CREATE OR REPLACE FUNCTION public.broadcast_normalize_phone(p text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN d LIKE '972%' THEN d
    WHEN d LIKE '0%' THEN '972' || substr(d, 2)
    ELSE '972' || d
  END
  FROM (
    SELECT regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^00', '') AS d
  ) x;
$$;

-- jsonb array of strings → does it contain v? (empty / missing array = no filter)
CREATE OR REPLACE FUNCTION public.broadcast_filter_hit(
  p_values jsonb, p_mode text, p_current text
) RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_values IS NULL OR jsonb_typeof(p_values) <> 'array' OR jsonb_array_length(p_values) = 0 THEN true
    WHEN coalesce(p_mode, 'include') = 'exclude' THEN NOT (p_values ? coalesce(p_current, ''))
    ELSE p_values ? coalesce(p_current, '')
  END;
$$;

-- Re-checks ONE lead or client against every synced list of its tenant:
--   * loads the record (and, for clients, its campaigners via client_team);
--   * evaluates each list's CRM filter (stage/status, agency, sales person,
--     services, campaigner, tags, not archived);
--   * match + has phone/email → upsert it as a member (refreshing a changed
--     phone/email); otherwise → remove it from that list.
-- Called by the row triggers below on every relevant change, so list
-- membership follows the CRM no matter where the change came from.
CREATE OR REPLACE FUNCTION public.broadcast_list_sync_entity(
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  l record;
  f jsonb;
  v_lead public.leads%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_match boolean;
  v_tagged boolean;
  v_name text;
  v_phone text;
  v_email text;
  v_src text := CASE p_entity_type WHEN 'lead' THEN 'leads' ELSE 'clients' END;
BEGIN
  IF p_tenant_id IS NULL OR p_entity_id IS NULL THEN RETURN; END IF;

  FOR l IN
    SELECT bl.id, bl.source_config
    FROM public.broadcast_lists bl
    LEFT JOIN public.automations a
      ON a.id = nullif(bl.source_config->>'sync_automation_id', '')::uuid
    WHERE bl.tenant_id = p_tenant_id
      AND bl.source = 'crm_filter'
      AND bl.kind = 'static'
      AND coalesce((bl.source_config->>'auto_sync')::boolean, false)
      AND bl.source_config->>'source' = v_src
      AND (bl.source_config->>'sync_automation_id' IS NULL OR coalesce(a.active, false))
  LOOP
    f := l.source_config;
    v_match := false;

    IF p_entity_type = 'lead' THEN
      SELECT * INTO v_lead FROM public.leads WHERE id = p_entity_id AND tenant_id = p_tenant_id;
      IF FOUND THEN
        v_match := v_lead.archived_at IS NULL
          AND public.broadcast_filter_hit(f->'stageKeys', f->>'stageMode', v_lead.status)
          AND public.broadcast_filter_hit(f->'statusKeys', f->>'statusMode', v_lead.response_status)
          AND public.broadcast_filter_hit(f->'salesPersonIds', 'include', v_lead.sales_person_id::text)
          AND public.broadcast_filter_hit(f->'agencyIds', 'include', v_lead.agency_id::text);
        v_name := coalesce(v_lead.contact_name, v_lead.company_name);
        v_phone := public.broadcast_normalize_phone(v_lead.phone);
        v_email := nullif(lower(btrim(v_lead.email)), '');
      END IF;
    ELSE
      SELECT * INTO v_client FROM public.clients WHERE id = p_entity_id AND tenant_id = p_tenant_id;
      IF FOUND THEN
        v_match := public.broadcast_filter_hit(f->'statuses', f->>'statusMode', v_client.status::text)
          AND public.broadcast_filter_hit(f->'agencyIds', 'include', v_client.agency_id::text)
          AND (
            jsonb_array_length(coalesce(f->'serviceTags', '[]'::jsonb)) = 0
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(coalesce(v_client.services, '[]'::jsonb)) s
              WHERE (f->'serviceTags') ? s
            )
          )
          AND (
            jsonb_array_length(coalesce(f->'campaignerIds', '[]'::jsonb)) = 0
            OR EXISTS (
              SELECT 1 FROM public.client_team ct
              WHERE ct.client_id = p_entity_id
                AND (f->'campaignerIds') ? ct.campaigner_id::text
                AND (ct.end_date IS NULL OR ct.end_date >= current_date)
            )
          );
        v_name := coalesce(v_client.contact_name, v_client.name);
        v_phone := public.broadcast_normalize_phone(v_client.phone);
        v_email := nullif(lower(btrim(v_client.email)), '');
      END IF;
    END IF;

    IF v_match AND jsonb_array_length(coalesce(f->'tagIds', '[]'::jsonb)) > 0 THEN
      SELECT EXISTS (
        SELECT 1 FROM public.chat_contact_tags t
        WHERE t.tenant_id = p_tenant_id
          AND (f->'tagIds') ? t.tag_id::text
          AND CASE p_entity_type WHEN 'lead' THEN t.lead_id ELSE t.client_id END = p_entity_id
      ) INTO v_tagged;
      v_match := CASE WHEN coalesce(f->>'tagMode', 'include') = 'exclude' THEN NOT v_tagged ELSE v_tagged END;
    END IF;

    IF v_match AND (v_phone IS NOT NULL OR v_email IS NOT NULL) THEN
      -- Refresh this record's row (its phone / email may have changed), then upsert.
      DELETE FROM public.broadcast_list_members
      WHERE list_id = l.id AND entity_id = p_entity_id
        AND (phone IS DISTINCT FROM v_phone OR email IS DISTINCT FROM v_email);
      PERFORM public.broadcast_list_add_members(
        l.id,
        jsonb_build_array(jsonb_build_object(
          'entity_type', p_entity_type, 'entity_id', p_entity_id,
          'name', v_name, 'phone', v_phone, 'email', v_email
        )),
        'automation'
      );
    ELSE
      DELETE FROM public.broadcast_list_members
      WHERE list_id = l.id AND entity_id = p_entity_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_list_sync_entity(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── Triggers ───────────────────────────────────────────────────────────────
-- Cheap guard first: most tenants have no synced lists.
CREATE OR REPLACE FUNCTION public.broadcast_tenant_has_synced_lists(p_tenant_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.broadcast_lists
    WHERE tenant_id = p_tenant_id AND source = 'crm_filter'
      AND coalesce((source_config->>'auto_sync')::boolean, false)
  );
$$;

CREATE OR REPLACE FUNCTION public.trg_broadcast_sync_lead()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF public.broadcast_tenant_has_synced_lists(NEW.tenant_id) THEN
    PERFORM public.broadcast_list_sync_entity(NEW.tenant_id, 'lead', NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast lead sync failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_broadcast_sync_client()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF public.broadcast_tenant_has_synced_lists(NEW.tenant_id) THEN
    PERFORM public.broadcast_list_sync_entity(NEW.tenant_id, 'client', NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast client sync failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- client_team (campaigner assignment) and chat_contact_tags point at the record.
CREATE OR REPLACE FUNCTION public.trg_broadcast_sync_related()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_tenant uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_TABLE_NAME = 'client_team' THEN
    SELECT tenant_id INTO v_tenant FROM public.clients WHERE id = r.client_id;
    IF public.broadcast_tenant_has_synced_lists(v_tenant) THEN
      PERFORM public.broadcast_list_sync_entity(v_tenant, 'client', r.client_id);
    END IF;
  ELSE
    IF public.broadcast_tenant_has_synced_lists(r.tenant_id) THEN
      IF r.lead_id IS NOT NULL THEN
        PERFORM public.broadcast_list_sync_entity(r.tenant_id, 'lead', r.lead_id);
      END IF;
      IF r.client_id IS NOT NULL THEN
        PERFORM public.broadcast_list_sync_entity(r.tenant_id, 'client', r.client_id);
      END IF;
    END IF;
  END IF;
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast related sync failed (%): %', TG_TABLE_NAME, SQLERRM;
  RETURN r;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_sync_lead ON public.leads;
CREATE TRIGGER trg_broadcast_sync_lead
  AFTER INSERT OR UPDATE OF status, response_status, agency_id, sales_person_id,
    archived_at, phone, email, contact_name, company_name
  ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_broadcast_sync_lead();

DROP TRIGGER IF EXISTS trg_broadcast_sync_client ON public.clients;
CREATE TRIGGER trg_broadcast_sync_client
  AFTER INSERT OR UPDATE OF status, agency_id, services, phone, email, contact_name, name
  ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_broadcast_sync_client();

DROP TRIGGER IF EXISTS trg_broadcast_sync_client_team ON public.client_team;
CREATE TRIGGER trg_broadcast_sync_client_team
  AFTER INSERT OR UPDATE OR DELETE ON public.client_team
  FOR EACH ROW EXECUTE FUNCTION public.trg_broadcast_sync_related();

DROP TRIGGER IF EXISTS trg_broadcast_sync_contact_tags ON public.chat_contact_tags;
CREATE TRIGGER trg_broadcast_sync_contact_tags
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_contact_tags
  FOR EACH ROW EXECUTE FUNCTION public.trg_broadcast_sync_related();

-- Lists created earlier today with a sync automation become auto-synced.
UPDATE public.broadcast_lists
SET source_config = source_config || '{"auto_sync": true}'::jsonb
WHERE source = 'crm_filter' AND kind = 'static'
  AND source_config ? 'sync_automation_id'
  AND NOT coalesce((source_config->>'auto_sync')::boolean, false);
