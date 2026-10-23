-- Mailing module (broadcast): lists v2, message templates, automation hooks.
--
-- 1. List members get custom_fields (extra file columns → template fields)
--    and can be added by automations.
-- 2. broadcast_list_add_members(): one upsert path for UI, sheet import and
--    automations. The old client upsert used ON CONFLICT (list_id, phone),
--    which cannot match the partial unique indexes.
-- 3. member_count is kept by a trigger instead of client-side recounts.
-- 4. message_templates: reusable email / WhatsApp content (rich or raw HTML
--    email via html_mode, plus file attachments).
-- 5. broadcasts gain template, HTML body, html_mode, attachments and
--    automation origin columns;
--    recipients keep a per-recipient merge-field snapshot (vars).

-- ── 1. List members ────────────────────────────────────────────────────────
-- custom_fields: flat {column: value} map of the uploaded file's extra
-- columns; read whole to build one recipient's merge fields.
ALTER TABLE public.broadcast_list_members
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.broadcast_list_members
  DROP CONSTRAINT IF EXISTS broadcast_list_members_added_via_check;
ALTER TABLE public.broadcast_list_members
  ADD CONSTRAINT broadcast_list_members_added_via_check
  CHECK (added_via = ANY (ARRAY['manual','csv','sheet','rule','crm','automation','file']));

CREATE INDEX IF NOT EXISTS idx_blmembers_entity
  ON public.broadcast_list_members (list_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- ── 2. Upsert RPC ──────────────────────────────────────────────────────────
-- p_rows: [{ name?, phone?, email?, entity_type?, entity_id?, custom_fields? }]
-- Phones must already be normalized by the caller (digits, country code).
CREATE OR REPLACE FUNCTION public.broadcast_list_add_members(
  p_list_id uuid,
  p_rows jsonb,
  p_added_via text DEFAULT 'manual'
) RETURNS integer
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_row jsonb;
  v_phone text;
  v_email text;
  v_type text;
  v_entity uuid;
  v_fields jsonb;
  v_count integer := 0;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.broadcast_lists WHERE id = p_list_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'broadcast list % not found', p_list_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    v_phone := NULLIF(btrim(v_row->>'phone'), '');
    v_email := NULLIF(lower(btrim(v_row->>'email')), '');
    CONTINUE WHEN v_phone IS NULL AND v_email IS NULL;

    v_type := COALESCE(NULLIF(v_row->>'entity_type', ''), 'manual');
    IF v_type NOT IN ('client','lead','campaigner','manual') THEN v_type := 'manual'; END IF;
    v_entity := NULLIF(v_row->>'entity_id', '')::uuid;
    v_fields := CASE WHEN jsonb_typeof(v_row->'custom_fields') = 'object'
                     THEN v_row->'custom_fields' ELSE '{}'::jsonb END;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.broadcast_list_members AS m
        (list_id, tenant_id, entity_type, entity_id, name, phone, email, added_via, custom_fields)
      VALUES
        (p_list_id, v_tenant, v_type, v_entity, NULLIF(btrim(v_row->>'name'), ''), v_phone, v_email, p_added_via, v_fields)
      ON CONFLICT (list_id, phone) WHERE phone IS NOT NULL DO UPDATE SET
        name = COALESCE(EXCLUDED.name, m.name),
        email = COALESCE(EXCLUDED.email, m.email),
        entity_type = CASE WHEN m.entity_type = 'manual' THEN EXCLUDED.entity_type ELSE m.entity_type END,
        entity_id = COALESCE(m.entity_id, EXCLUDED.entity_id),
        custom_fields = m.custom_fields || EXCLUDED.custom_fields;
    ELSE
      INSERT INTO public.broadcast_list_members AS m
        (list_id, tenant_id, entity_type, entity_id, name, phone, email, added_via, custom_fields)
      VALUES
        (p_list_id, v_tenant, v_type, v_entity, NULLIF(btrim(v_row->>'name'), ''), NULL, v_email, p_added_via, v_fields)
      ON CONFLICT (list_id, email) WHERE email IS NOT NULL AND phone IS NULL DO UPDATE SET
        name = COALESCE(EXCLUDED.name, m.name),
        entity_type = CASE WHEN m.entity_type = 'manual' THEN EXCLUDED.entity_type ELSE m.entity_type END,
        entity_id = COALESCE(m.entity_id, EXCLUDED.entity_id),
        custom_fields = m.custom_fields || EXCLUDED.custom_fields;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcast_list_add_members(uuid, jsonb, text) TO authenticated, service_role;

-- ── 3. member_count trigger ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_list_members_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.broadcast_lists SET member_count = member_count + 1 WHERE id = NEW.list_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.broadcast_lists SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.list_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_blmembers_count ON public.broadcast_list_members;
CREATE TRIGGER trg_blmembers_count
  AFTER INSERT OR DELETE ON public.broadcast_list_members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_list_members_count();

-- Re-baseline counts for static lists (dynamic CRM lists store their last preview count).
UPDATE public.broadcast_lists l
SET member_count = (SELECT count(*) FROM public.broadcast_list_members m WHERE m.list_id = l.id)
WHERE l.source <> 'crm_filter';

-- ── 4. Message templates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp')),
  subject text,
  body_html text,
  -- true: body_html is ready-made HTML sent as-is (scripts stripped);
  -- false: rich-editor HTML wrapped in the default RTL container.
  html_mode boolean NOT NULL DEFAULT false,
  -- [{name, path, url, size, content_type}] in Storage (broadcast-media).
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_text text,
  media_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant
  ON public.message_templates (tenant_id) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Read: templates of the user's current tenant (super admins: all).
DROP POLICY IF EXISTS mtemplates_tenant_select ON public.message_templates;
CREATE POLICY mtemplates_tenant_select ON public.message_templates FOR SELECT TO authenticated
  USING (tenant_id = public.get_effective_tenant_id() OR public.is_super_admin(auth.uid()));

-- Create: only into the user's current tenant (super admins: any).
DROP POLICY IF EXISTS mtemplates_tenant_insert ON public.message_templates;
CREATE POLICY mtemplates_tenant_insert ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_effective_tenant_id() OR public.is_super_admin(auth.uid()));

-- Edit: own-tenant templates, and they cannot be moved to another tenant.
DROP POLICY IF EXISTS mtemplates_tenant_update ON public.message_templates;
CREATE POLICY mtemplates_tenant_update ON public.message_templates FOR UPDATE TO authenticated
  USING (tenant_id = public.get_effective_tenant_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_effective_tenant_id() OR public.is_super_admin(auth.uid()));

-- Delete: own-tenant templates (super admins: any).
DROP POLICY IF EXISTS mtemplates_tenant_delete ON public.message_templates;
CREATE POLICY mtemplates_tenant_delete ON public.message_templates FOR DELETE TO authenticated
  USING (tenant_id = public.get_effective_tenant_id() OR public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

-- ── 5. Broadcasts and recipients ───────────────────────────────────────────
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS html_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS automation_id uuid REFERENCES public.automations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS automation_step_key text;

ALTER TABLE public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_origin_check;
ALTER TABLE public.broadcasts
  ADD CONSTRAINT broadcasts_origin_check CHECK (origin IN ('manual','automation'));

-- Lookup of an automation step's broadcasts (per-contact stream + list send guard).
CREATE INDEX IF NOT EXISTS idx_broadcasts_automation_step
  ON public.broadcasts (automation_id, automation_step_key, created_at DESC)
  WHERE origin = 'automation';

ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS vars jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Email recipients are stored without phone, so dedupe them by email.
CREATE UNIQUE INDEX IF NOT EXISTS uq_br_broadcast_email
  ON public.broadcast_recipients (broadcast_id, email)
  WHERE email IS NOT NULL AND phone IS NULL;
