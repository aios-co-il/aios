-- One-off data fix (Production tenant pdpsagot, 2026-10-19 13:38 UTC).
-- The Facebook lead "Tzachi Strulovich" (placeholder email aaaaa@gmail.com) was merged
-- by email into the older lead "ירין" instead of being created.
-- 1) Restore "ירין" to its state before that webhook call.
-- 2) Create the missing lead.
-- Safe on every environment: does nothing unless the exact Production rows exist.

DO $$
DECLARE
  v_tenant_id uuid := 'ac7f9a3e-a042-4a64-afea-53e21a544d3d';
  v_merged_lead_id uuid := '0032200b-7aca-442a-a9f7-c685ab944604';
  v_new_lead_id uuid;
  v_tag_id uuid;
BEGIN
  -- 1) Restore the wrongly updated lead
  IF EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = v_merged_lead_id
      AND tenant_id = v_tenant_id
      AND notes LIKE '%' || E'\n\n' || '[2026-10-19T13:38:00.274Z] לא'
  ) THEN
    UPDATE public.leads
    SET notes = replace(notes, E'\n\n' || '[2026-10-19T13:38:00.274Z] לא', ''),
        created_at = COALESCE(first_created_at, created_at),
        source = COALESCE(first_source, source)
    WHERE id = v_merged_lead_id;

    -- Return the tags to their pre-merge set: drop the link the merge added
    -- (13:38-13:39) and any origin tag the source restore above re-creates in
    -- this transaction (created_at = now()). Tags users added since stay.
    DELETE FROM public.chat_contact_tags
    WHERE lead_id = v_merged_lead_id
      AND (created_at BETWEEN '2026-10-19 13:38:00+00' AND '2026-10-19 13:39:00+00'
           OR created_at = now());
  END IF;

  -- 2) Create the lead that never got its own card. The insert fires the same
  -- triggers a webhook insert does (ManyChat sync, broadcast list rules), as
  -- intended: the lead gets what it would have had on 2026-10-19.
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.leads
       WHERE tenant_id = v_tenant_id
         AND regexp_replace(coalesce(phone, ''), '\D', '', 'g')
             IN ('0547970059', '972547970059')
     )
  THEN
    INSERT INTO public.leads (
      tenant_id, company_name, contact_name, email, phone,
      source, notes, status, created_at
    )
    VALUES (
      v_tenant_id, '', 'Tzachi Strulovich', 'aaaaa@gmail.com', '+972547970059',
      'other', 'לא', 'new', '2026-10-19 13:38:00+00'
    )
    RETURNING id INTO v_new_lead_id;

    -- Same tag the Make scenario sends
    SELECT id INTO v_tag_id
    FROM public.chat_tags
    WHERE tenant_id = v_tenant_id AND name = 'רשימת דוד'
    LIMIT 1;

    IF v_tag_id IS NOT NULL THEN
      INSERT INTO public.chat_contact_tags (tenant_id, tag_id, lead_id, user_id)
      VALUES (v_tenant_id, v_tag_id, v_new_lead_id, '00000000-0000-0000-0000-000000000000');
    END IF;
  END IF;
END $$;
