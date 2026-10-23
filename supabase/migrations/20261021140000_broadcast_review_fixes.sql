-- Mailing lists: review fixes for PR #892.
--
-- 1. "synced" is a real list kind (kind = 'synced') instead of a static list
--    with source_config.auto_sync; lists record their last sync error.
-- 2. One owner of "does this lead / client match a CRM filter":
--    broadcast_matching_entity_ids() (all matching ids) and
--    broadcast_entity_matches() (one id). The sync below and the edge
--    functions both call them, so there is no second copy of the predicates.
-- 3. broadcast_list_sync_entity() loads the record once, keeps a member's
--    custom_fields when its phone / email changes, and records a per-list
--    error instead of failing the whole sync.
-- 4. Deleting a lead / client removes it from synced lists; deleting a list's
--    sync automation turns the list back into a static list.
-- 5. member_count re-baseline, 'sync' as an added_via value, and a 10 MB
--    file limit on the broadcast-media bucket.

-- ── 1. Kind, error columns, added_via ──────────────────────────────────────
ALTER TABLE public.broadcast_lists
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_sync_error_at timestamptz;

ALTER TABLE public.broadcast_lists DROP CONSTRAINT IF EXISTS broadcast_lists_kind_check;
ALTER TABLE public.broadcast_lists
  ADD CONSTRAINT broadcast_lists_kind_check CHECK (kind IN ('static','dynamic','synced'));

ALTER TABLE public.broadcast_list_members
  DROP CONSTRAINT IF EXISTS broadcast_list_members_added_via_check;
ALTER TABLE public.broadcast_list_members
  ADD CONSTRAINT broadcast_list_members_added_via_check
  CHECK (added_via = ANY (ARRAY['manual','csv','sheet','rule','crm','automation','file','sync']));

-- Lists that were synced through source_config.auto_sync. kind = 'static'
-- matches the old sync's eligibility, so dynamic lists are never converted.
UPDATE public.broadcast_lists
SET kind = 'synced'
WHERE source = 'crm_filter' AND kind = 'static'
  AND coalesce((source_config->>'auto_sync')::boolean, false);

-- ── 2. CRM filter matching ─────────────────────────────────────────────────
-- Ids of the tenant's leads (p_entity_type 'lead') or clients ('client')
-- matching an AudienceFilter, oldest first (ORDER BY created_at, id, so
-- callers can page with .range()). Mirrors the TS filter semantics:
--   leads:   not archived; stageKeys/stageMode on status, statusKeys/statusMode
--            on response_status; salesPersonIds and agencyIds include-only;
--   clients: statuses/statusMode on status; agencyIds include-only; any of
--            serviceTags in services; a campaignerIds member in client_team
--            that has not ended (UTC today);
--   both:    tagIds/tagMode via chat_contact_tags; filter.source, when set,
--            must be the entity's source ('leads' / 'clients').
-- Plain SQL, STABLE, SECURITY INVOKER and no SET clause, so Postgres inlines
-- it into the caller's query: an id filter on the result becomes a primary
-- key lookup, and RLS applies to the caller. Tables are schema-qualified
-- because an inlinable function cannot pin search_path.
CREATE OR REPLACE FUNCTION public.broadcast_matching_entity_ids(
  p_tenant_id uuid,
  p_entity_type text,
  p_filter jsonb
) RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
AS $$
  SELECT m.id
  FROM (
    SELECT l.id, l.created_at
    FROM (
      SELECT
        CASE WHEN jsonb_typeof(p_filter->'tagIds') = 'array'
             THEN p_filter->'tagIds' ELSE '[]'::jsonb END AS tag_ids
    ) f
    JOIN public.leads l ON l.tenant_id = p_tenant_id
    WHERE p_entity_type = 'lead'
      AND coalesce(p_filter->>'source', 'leads') = 'leads'
      AND l.archived_at IS NULL
      AND public.broadcast_filter_hit(p_filter->'stageKeys', p_filter->>'stageMode', l.status)
      AND public.broadcast_filter_hit(p_filter->'statusKeys', p_filter->>'statusMode', l.response_status)
      AND public.broadcast_filter_hit(p_filter->'salesPersonIds', 'include', l.sales_person_id::text)
      AND public.broadcast_filter_hit(p_filter->'agencyIds', 'include', l.agency_id::text)
      AND (
        jsonb_array_length(f.tag_ids) = 0
        OR EXISTS (
          SELECT 1 FROM public.chat_contact_tags t
          WHERE t.tenant_id = p_tenant_id AND t.lead_id = l.id
            AND f.tag_ids ? t.tag_id::text
        ) = (coalesce(p_filter->>'tagMode', 'include') <> 'exclude')
      )

    UNION ALL

    SELECT c.id, c.created_at
    FROM (
      SELECT
        CASE WHEN jsonb_typeof(p_filter->'tagIds') = 'array'
             THEN p_filter->'tagIds' ELSE '[]'::jsonb END AS tag_ids,
        CASE WHEN jsonb_typeof(p_filter->'serviceTags') = 'array'
             THEN p_filter->'serviceTags' ELSE '[]'::jsonb END AS service_tags,
        CASE WHEN jsonb_typeof(p_filter->'campaignerIds') = 'array'
             THEN p_filter->'campaignerIds' ELSE '[]'::jsonb END AS campaigner_ids
    ) f
    JOIN public.clients c ON c.tenant_id = p_tenant_id
    WHERE p_entity_type = 'client'
      AND coalesce(p_filter->>'source', 'clients') = 'clients'
      AND public.broadcast_filter_hit(p_filter->'statuses', p_filter->>'statusMode', c.status::text)
      AND public.broadcast_filter_hit(p_filter->'agencyIds', 'include', c.agency_id::text)
      AND (
        jsonb_array_length(f.service_tags) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.services) = 'array' THEN c.services ELSE '[]'::jsonb END
          ) s
          WHERE jsonb_typeof(s) = 'string' AND f.service_tags ? (s #>> '{}')
        )
      )
      AND (
        jsonb_array_length(f.campaigner_ids) = 0
        OR EXISTS (
          SELECT 1 FROM public.client_team ct
          WHERE ct.client_id = c.id
            AND f.campaigner_ids ? ct.campaigner_id::text
            AND (ct.end_date IS NULL OR ct.end_date >= (now() AT TIME ZONE 'UTC')::date)
        )
      )
      AND (
        jsonb_array_length(f.tag_ids) = 0
        OR EXISTS (
          SELECT 1 FROM public.chat_contact_tags t
          WHERE t.tenant_id = p_tenant_id AND t.client_id = c.id
            AND f.tag_ids ? t.tag_id::text
        ) = (coalesce(p_filter->>'tagMode', 'include') <> 'exclude')
      )
  ) m
  ORDER BY m.created_at, m.id;
$$;

-- Does one lead / client match the filter right now? (sync_mailing_list
-- action and the list sync below.) Unknown entity types never match.
CREATE OR REPLACE FUNCTION public.broadcast_entity_matches(
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_filter jsonb
) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.broadcast_matching_entity_ids(p_tenant_id, p_entity_type, p_filter) AS m(id)
    WHERE m.id = p_entity_id
  );
$$;

REVOKE ALL ON FUNCTION public.broadcast_matching_entity_ids(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broadcast_matching_entity_ids(uuid, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.broadcast_entity_matches(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broadcast_entity_matches(uuid, text, uuid, jsonb) TO authenticated, service_role;

-- ── 3. Sync one record into the tenant's synced lists ──────────────────────
-- For each synced list of the record's source (whose sync automation, when it
-- has one, is active):
--   * match + phone/email → update the record's member row in place (keeps
--     custom_fields; extra rows of the record are dropped), or add it with
--     added_via = 'sync';
--   * otherwise → remove the record from the list.
-- Each list runs in its own sub-transaction: a failure (for example the new
-- phone already belongs to another member) is stored on that list in
-- last_sync_error and does not affect the other lists or the CRM write; the
-- next successful sync of the list clears it.
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
  v_src text;
  v_name text;
  v_phone text;
  v_email text;
  v_member uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_entity_id IS NULL THEN RETURN; END IF;

  IF p_entity_type = 'lead' THEN
    v_src := 'leads';
    SELECT coalesce(contact_name, company_name), broadcast_normalize_phone(phone),
           nullif(lower(btrim(email)), '')
      INTO v_name, v_phone, v_email
      FROM public.leads WHERE id = p_entity_id AND tenant_id = p_tenant_id;
  ELSIF p_entity_type = 'client' THEN
    v_src := 'clients';
    SELECT coalesce(contact_name, name), broadcast_normalize_phone(phone),
           nullif(lower(btrim(email)), '')
      INTO v_name, v_phone, v_email
      FROM public.clients WHERE id = p_entity_id AND tenant_id = p_tenant_id;
  ELSE
    RETURN;
  END IF;

  FOR l IN
    SELECT bl.id, bl.source_config, bl.last_sync_error
    FROM public.broadcast_lists bl
    LEFT JOIN public.automations a
      ON a.id = nullif(bl.source_config->>'sync_automation_id', '')::uuid
    WHERE bl.tenant_id = p_tenant_id
      AND bl.kind = 'synced'
      AND bl.source = 'crm_filter'
      AND bl.source_config->>'source' = v_src
      AND (nullif(bl.source_config->>'sync_automation_id', '') IS NULL OR coalesce(a.active, false))
  LOOP
    BEGIN
      IF (v_phone IS NOT NULL OR v_email IS NOT NULL)
        AND public.broadcast_entity_matches(p_tenant_id, p_entity_type, p_entity_id, l.source_config)
      THEN
        SELECT m.id INTO v_member
        FROM public.broadcast_list_members m
        WHERE m.list_id = l.id AND m.entity_type = p_entity_type AND m.entity_id = p_entity_id
        ORDER BY m.created_at, m.id
        LIMIT 1;

        IF v_member IS NULL THEN
          PERFORM public.broadcast_list_add_members(
            l.id,
            jsonb_build_array(jsonb_build_object(
              'entity_type', p_entity_type, 'entity_id', p_entity_id,
              'name', v_name, 'phone', v_phone, 'email', v_email
            )),
            'sync'
          );
        ELSE
          DELETE FROM public.broadcast_list_members
          WHERE list_id = l.id AND entity_type = p_entity_type AND entity_id = p_entity_id
            AND id <> v_member;
          UPDATE public.broadcast_list_members
          SET name = v_name, phone = v_phone, email = v_email
          WHERE id = v_member
            AND (name IS DISTINCT FROM v_name OR phone IS DISTINCT FROM v_phone
                 OR email IS DISTINCT FROM v_email);
        END IF;
      ELSE
        DELETE FROM public.broadcast_list_members
        WHERE list_id = l.id AND entity_type = p_entity_type AND entity_id = p_entity_id;
      END IF;

      IF l.last_sync_error IS NOT NULL THEN
        UPDATE public.broadcast_lists
        SET last_sync_error = NULL, last_sync_error_at = NULL
        WHERE id = l.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.broadcast_lists
      SET last_sync_error = SQLERRM, last_sync_error_at = now()
      WHERE id = l.id;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_list_sync_entity(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Cheap trigger guard: most tenants have no synced lists.
CREATE OR REPLACE FUNCTION public.broadcast_tenant_has_synced_lists(p_tenant_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.broadcast_lists
    WHERE tenant_id = p_tenant_id AND kind = 'synced'
  );
$$;

-- ── 4. Deletes ─────────────────────────────────────────────────────────────
-- A deleted lead / client leaves every synced list of its tenant.
CREATE OR REPLACE FUNCTION public.trg_broadcast_unsync_deleted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_type text := CASE TG_TABLE_NAME WHEN 'leads' THEN 'lead' ELSE 'client' END;
BEGIN
  DELETE FROM public.broadcast_list_members m
  USING public.broadcast_lists bl
  WHERE m.list_id = bl.id
    AND bl.tenant_id = OLD.tenant_id
    AND bl.kind = 'synced'
    AND m.entity_type = v_type
    AND m.entity_id = OLD.id;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast unsync of deleted % % failed: %', v_type, OLD.id, SQLERRM;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_unsync_deleted ON public.leads;
CREATE TRIGGER trg_broadcast_unsync_deleted
  AFTER DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_broadcast_unsync_deleted();

DROP TRIGGER IF EXISTS trg_broadcast_unsync_deleted ON public.clients;
CREATE TRIGGER trg_broadcast_unsync_deleted
  AFTER DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_broadcast_unsync_deleted();

-- A deleted sync automation unlinks its lists: they keep their members and
-- become static lists.
CREATE OR REPLACE FUNCTION public.trg_broadcast_unlink_sync_automation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.broadcast_lists
  SET kind = CASE WHEN kind = 'synced' THEN 'static' ELSE kind END,
      source_config = source_config - 'auto_sync' - 'sync_automation_id'
  WHERE source_config->>'sync_automation_id' = OLD.id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_unlink_sync_automation ON public.automations;
CREATE TRIGGER trg_broadcast_unlink_sync_automation
  AFTER DELETE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.trg_broadcast_unlink_sync_automation();

-- ── 5. Counts and storage ──────────────────────────────────────────────────
-- Every list keeps its real member count, except dynamic CRM lists (they
-- store their last preview count). Runs after the 'synced' backfill.
UPDATE public.broadcast_lists l
SET member_count = c.n
FROM (
  SELECT bl.id, (SELECT count(*) FROM public.broadcast_list_members m WHERE m.list_id = bl.id)::integer AS n
  FROM public.broadcast_lists bl
  WHERE NOT (bl.source = 'crm_filter' AND bl.kind = 'dynamic')
) c
WHERE l.id = c.id AND l.member_count IS DISTINCT FROM c.n;

-- Same 10 MB limit as the upload UI.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'broadcast-media limit: storage schema not installed, skipped';
    RETURN;
  END IF;
  UPDATE storage.buckets SET file_size_limit = 10485760
  WHERE id = 'broadcast-media' AND file_size_limit IS DISTINCT FROM 10485760;
END;
$$;
