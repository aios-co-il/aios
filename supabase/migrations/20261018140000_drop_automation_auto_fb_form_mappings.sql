-- Picking a Facebook form in an automation trigger used to auto-register an
-- empty CRM form mapping. That mapping made the lead webhook create CRM leads
-- and skip the automation-only path. Remove only mappings that still have the
-- exact auto-registered shape and whose form an automation trigger references.
WITH auto_mappings AS (
  SELECT t.id, m.key AS form_id
  FROM public.tenant_integrations t
  CROSS JOIN LATERAL jsonb_each(COALESCE(t.settings -> 'form_mappings', '{}'::jsonb)) AS m(key, value)
  WHERE t.integration_type = 'facebook_lead_ads'
    AND jsonb_typeof(m.value) = 'object'
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(m.value) k)
        = ARRAY['agency_id', 'fields', 'form_name', 'page_id', 'page_name', 'sales_person_ids']
    AND m.value -> 'fields' = '{}'::jsonb
    AND m.value -> 'agency_id' = 'null'::jsonb
    AND m.value -> 'sales_person_ids' = '[]'::jsonb
    AND EXISTS (
      SELECT 1
      FROM public.automation_flow_steps s
      WHERE s.step_type = 'trigger'
        AND s.tenant_id = t.tenant_id
        AND s.configuration ->> 'facebook_form_id' = m.key
        AND s.configuration ->> 'facebook_integration_id' = t.id::text
    )
)
UPDATE public.tenant_integrations t
SET settings = jsonb_set(
  t.settings,
  '{form_mappings}',
  (t.settings -> 'form_mappings') - ARRAY(
    SELECT a.form_id FROM auto_mappings a WHERE a.id = t.id
  )
)
WHERE t.id IN (SELECT id FROM auto_mappings);
