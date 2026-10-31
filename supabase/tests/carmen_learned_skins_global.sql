-- Carmen's learned skins for every org (20261030090000_carmen_learned_skins_for_every_org):
-- the skill registry gives each skin to a tenant with no row of its own, a
-- tenant row still wins, the global text names no person, phone or tool,
-- everyday commands match no trigger, and MarketingCaptain's
-- dmm_notify_recipient_routing is inactive.
-- Synthetic rows inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_slugs text[] := ARRAY[
    'group_response_only_when_addressed',
    'wa_notify_never_group_session',
    'carmen_session_keyed_by_chat_id'
  ];
  v_tenant uuid;
  v_new_tenant uuid := gen_random_uuid();
  v_bad text;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;

  -- One active global row per slug.
  SELECT string_agg(want.slug, ', ') INTO v_bad
  FROM unnest(v_slugs) AS want (slug)
  WHERE (
    SELECT count(*)
    FROM public.ai_skills AS s
    WHERE s.slug = want.slug
      AND s.scope = 'global'
      AND s.tenant_id IS NULL
      AND s.is_active
  ) <> 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'global: expected one active global row for %', v_bad;
  END IF;

  -- Every tenant can read the global text, so it names no phone, person or tool.
  SELECT string_agg(s.slug, ', ') INTO v_bad
  FROM public.ai_skills AS s
  WHERE s.scope = 'global'
    AND s.slug = ANY (v_slugs)
    AND concat_ws(' ', s.name, s.description, s.goal, s.steps, s.system_prompt,
                  s.constraints, s.output_template, array_to_string(s.triggers, ' '),
                  array_to_string(s.trigger_phrases, ' '))
        ~* '[0-9]{6,}|דוד|פליקס|david|felix|cursor|claude|marketingcaptain';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'content: org-specific text in %', v_bad;
  END IF;

  -- DMM's pulse recipients come from the per-org setting (AIO-260), not this skin.
  IF EXISTS (
    SELECT 1
    FROM public.ai_skills AS s
    JOIN public.tenants AS t ON t.id = s.tenant_id
    WHERE t.slug = 'marketingcaptain'
      AND s.scope = 'tenant'
      AND s.slug = 'dmm_notify_recipient_routing'
      AND s.is_active
  ) THEN
    RAISE EXCEPTION 'retire: dmm_notify_recipient_routing is still active for marketingcaptain';
  END IF;

  -- A tenant row for the first slug, as MarketingCaptain has.
  INSERT INTO public.ai_skills (tenant_id, scope, slug, name, description, steps, is_active)
  VALUES (v_tenant, 'tenant', v_slugs[1], 'QA ROLLBACK', 'QA ROLLBACK', 'QA ROLLBACK', true);

  -- Registry filter (registry.ts loadSkillsForTenant): global rows plus the
  -- tenant's own, and the tenant row wins on the same slug.
  CREATE TEMP TABLE registry_pick ON COMMIT DROP AS
  SELECT DISTINCT ON (t.tenant_id, s.slug) t.tenant_id, s.slug, s.scope
  FROM (VALUES (v_tenant), (v_new_tenant)) AS t (tenant_id)
  JOIN public.ai_skills AS s
    ON s.is_active
   AND (s.scope = 'global' OR (s.scope = 'tenant' AND s.tenant_id = t.tenant_id))
  WHERE s.slug = ANY (v_slugs)
  ORDER BY t.tenant_id, s.slug, (s.scope = 'tenant') DESC;

  SELECT string_agg(want.slug, ', ') INTO v_bad
  FROM unnest(v_slugs) AS want (slug)
  WHERE NOT EXISTS (
    SELECT 1
    FROM registry_pick AS p
    WHERE p.tenant_id = v_new_tenant
      AND p.slug = want.slug
      AND p.scope = 'global'
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'registry: a tenant with no rows of its own misses %', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM registry_pick AS p
    WHERE p.tenant_id = v_tenant
      AND p.slug = v_slugs[1]
      AND p.scope = 'tenant'
  ) THEN
    RAISE EXCEPTION 'registry: the tenant row must win over the global row';
  END IF;

  -- Trigger match (registry.ts rowToSkill): each trigger becomes a
  -- case-insensitive regex, found anywhere in the text, with regex characters
  -- escaped and whitespace optional.
  CREATE TEMP TABLE trigger_hit ON COMMIT DROP AS
  SELECT sample.text, s.slug
  FROM (
    VALUES
      ('כרמן תסכמי את הקמפיינים של השבוע'),
      ('תסכמי את הפגישה'),
      ('תרשמי את המשימה'),
      ('תפרסמי את הפוסט'),
      ('מי אתמול התקשר?'),
      ('כרמן, מי את?'),
      ('כרמן, מי את בכלל?'),
      ('who are you')
  ) AS sample (text)
  CROSS JOIN public.ai_skills AS s
  CROSS JOIN LATERAL unnest(s.triggers || s.trigger_phrases) AS t (phrase)
  WHERE s.scope = 'global'
    AND s.slug = ANY (v_slugs)
    AND sample.text ~* regexp_replace(
      regexp_replace(t.phrase, '([.*+?^${}()|\[\]\\])', '\\\1', 'g'),
      '\s+', '\s*', 'g'
    );

  -- Everyday commands route to none of these skins.
  SELECT string_agg(format('%s -> %s', h.text, h.slug), ', ') INTO v_bad
  FROM trigger_hit AS h
  WHERE h.text IN ('כרמן תסכמי את הקמפיינים של השבוע', 'תסכמי את הפגישה',
                   'תרשמי את המשימה', 'תפרסמי את הפוסט', 'מי אתמול התקשר?');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'triggers: an everyday command matches %', v_bad;
  END IF;

  -- identity-guard and diagnose_campaign_pulse_status stay tenant rows: a
  -- global row would reach every agent of every org.
  IF EXISTS (
    SELECT 1
    FROM public.ai_skills AS s
    WHERE s.scope = 'global'
      AND s.slug IN ('identity-guard', 'diagnose_campaign_pulse_status')
      AND s.created_by_agent = false
      AND s.name IN ('תמיד מזדהה ככרמן', 'אבחון בדיקת דופק: אין טבלה מול סנכרון ישן')
  ) THEN
    RAISE EXCEPTION 'global: identity-guard or diagnose_campaign_pulse_status was made global';
  END IF;
END
$test$;
ROLLBACK;
