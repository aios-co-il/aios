-- Carmen's learned skins for every org (AIO-262).
--
-- Carmen learned these rules while talking to MarketingCaptain (tenant slug
-- 'marketingcaptain'), so they were saved as that tenant's skins. The skill
-- registry loads global skins plus the agent's own tenant, so DMM's Carmen
-- (slug 'dmm') and every other org's Carmen never saw them.
--
-- 1. Generic Carmen conduct becomes global: the MarketingCaptain row of each
--    slug below moves to scope 'global' (tenant_id NULL), unless a global row
--    with that slug already exists. MarketingCaptain keeps the same text.
--    Skins that name MarketingCaptain's people, phones, clients or dev tools
--    stay where they are.
-- 2. dmm_notify_recipient_routing is retired: it told Carmen that DMM pulse
--    updates go to Felix only, but David decided they go to Felix and David,
--    set through the per-org report recipients (AIO-260), not a skin.
--
-- Keyed by slug and tenant slug, never by id, so Staging and Production apply
-- the same change. Triggers fired: ai_skills_search_vector_trg,
-- bump_ai_skill_version_trg and update_ai_skills_updated_at (BEFORE UPDATE).
-- No message is sent.

-- One-line check per environment before and after (read-only):
--   SELECT slug, scope, tenant_id, is_active FROM public.ai_skills
--   WHERE slug IN (<the slugs below>, 'dmm_notify_recipient_routing');

WITH marketing_captain AS (
  SELECT t.id
  FROM public.tenants AS t
  WHERE t.slug = 'marketingcaptain'
),
generic AS (
  SELECT DISTINCT ON (s.slug) s.id
  FROM public.ai_skills AS s
  JOIN marketing_captain AS mc ON mc.id = s.tenant_id
  WHERE s.scope = 'tenant'
    AND s.is_active
    AND s.slug IN (
      'identity-guard',
      'group_response_only_when_addressed',
      'wa_notify_never_group_session',
      'carmen_session_keyed_by_chat_id',
      'wa_voice_transcript_capability',
      'team_roster_awareness',
      'diagnose_campaign_pulse_status',
      'pulse_health_wa_digest_and_sync_truth'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ai_skills AS g
      WHERE g.slug = s.slug
        AND g.scope = 'global'
    )
  ORDER BY s.slug, s.updated_at DESC, s.id
)
UPDATE public.ai_skills AS s
SET scope = 'global',
    tenant_id = NULL
FROM generic
WHERE s.id = generic.id;

UPDATE public.ai_skills AS s
SET is_active = false
FROM public.tenants AS t
WHERE t.id = s.tenant_id
  AND t.slug = 'marketingcaptain'
  AND s.slug = 'dmm_notify_recipient_routing'
  AND s.is_active;
