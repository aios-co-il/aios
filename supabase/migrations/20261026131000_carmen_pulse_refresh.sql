-- AIO-237: Carmen refreshes the campaign pulse in chat.
--
-- 1. campaign_pulse_refresh_claims + claim_campaign_pulse_refresh(): the rate
--    limit behind run-ai-agent's refresh_campaign_pulse tool. At most one
--    refresh per tenant per interval (the tool asks for 600 seconds); a caller
--    that loses the claim gets the stored snapshot. The refresh itself calls
--    campaign-pulse-snapshot with deliver:false, skip_instant_alerts:true and
--    preview_only:true, so it sends no digest and no instant alert.
-- 2. The global pulse_check and ecommerce_pulse skins get their canonical text
--    from supabase/functions/_shared/skills/pulse-skill-rows.ts (also the
--    registry fallback; pulse-skill-rows.test.ts keeps the two identical).
--    The upsert inserts a missing row and overwrites an existing one, keeping
--    trigger phrases added in the UI and the row's is_active flag. Triggers
--    are stored sorted on both paths, so re-running it does not bump version. The
--    ecommerce_pulse skin no longer names Shopify/WooCommerce order tools,
--    which do not exist.
--    Tenant override rows (scope = 'tenant') for these slugs are left
--    untouched on purpose: they win over the global row, so a tenant that has
--    one keeps its own text until it is edited or deactivated in the UI. The
--    NOTICE below counts them so the deploy log shows whether any exist.
--
-- Nothing here sends a message or replays an old notification.

CREATE TABLE IF NOT EXISTS public.campaign_pulse_refresh_claims (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  last_claimed_at timestamptz NOT NULL DEFAULT now(),
  last_claimed_by uuid,
  claim_count integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.campaign_pulse_refresh_claims IS
  'AIO-237: last on-demand pulse refresh per tenant (refresh_campaign_pulse). Rate limit only; service role only.';

ALTER TABLE public.campaign_pulse_refresh_claims ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (run-ai-agent) reads or writes it.
REVOKE ALL ON TABLE public.campaign_pulse_refresh_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.campaign_pulse_refresh_claims TO service_role;

-- Returns true when this call may refresh the tenant's pulse now. The
-- ON CONFLICT row lock makes concurrent callers serialize: one wins, the rest
-- see the fresh claim and get false.
CREATE OR REPLACE FUNCTION public.claim_campaign_pulse_refresh(
  p_tenant_id uuid,
  p_min_interval_seconds integer,
  p_requested_by uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_interval interval := make_interval(
    secs => GREATEST(p_min_interval_seconds, 60)
  );
  v_claimed boolean;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE NOTICE 'claim_campaign_pulse_refresh: null tenant';
    RETURN false;
  END IF;

  INSERT INTO public.campaign_pulse_refresh_claims AS claims
    (tenant_id, last_claimed_at, last_claimed_by, claim_count)
  VALUES (p_tenant_id, now(), p_requested_by, 1)
  ON CONFLICT (tenant_id) DO UPDATE
    SET last_claimed_at = now(),
        last_claimed_by = EXCLUDED.last_claimed_by,
        claim_count = claims.claim_count + 1
    WHERE claims.last_claimed_at <= now() - v_interval
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

COMMENT ON FUNCTION public.claim_campaign_pulse_refresh(uuid, integer, uuid) IS
  'AIO-237: claim an on-demand pulse refresh for a tenant; false while the previous claim is younger than the interval (minimum 60 seconds).';

REVOKE ALL ON FUNCTION public.claim_campaign_pulse_refresh(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_pulse_refresh(uuid, integer, uuid)
  TO service_role;

-- Global pulse skins (text from _shared/skills/pulse-skill-rows.ts).
INSERT INTO public.ai_skills AS skills
  (slug, scope, tenant_id, name, description, goal, system_prompt, constraints, steps, output_template, allowed_tools, triggers, is_active, created_by_agent)
VALUES (
  'pulse_check',
  'global',
  NULL,
  $$בדיקת דופק$$,
  $$הצגת בדיקת הדופק האחרונה שנשמרה, או רענון שלה כשמבקשים דופק עדכני.$$,
  $$למסור את מצב הקמפיינים של הלקוחות מתוך בדיקת הדופק, בלי לשלוח הודעות ובלי להמציא נתונים.$$,
  $$בקשה ל"דופק" או ל"בדיקת דופק" בלי בקשה לרענן — קראי ל-get_latest_campaign_pulse והציגי את הבדיקה האחרונה שנשמרה.
"רענני דופק", "דופק עדכני" או "בדיקת דופק מלאה ועדכנית" — קראי ל-refresh_campaign_pulse. הכלי מחשב את הדופק מחדש מהנתונים שכבר סונכרנו, לא שולח הודעות, ומרענן לכל היותר פעם ב-10 דקות לארגון; אחרת הוא מחזיר את הבדיקה הקיימת עם זמן החישוב.
הבדיקה כוללת את מועד השיחה הטלפונית האחרונה עם הלקוח שתועדה בכרטיס הלקוח ומי תיעד אותה, והתראה כשלא תועדה שיחה ב-14 הימים האחרונים. עדכון שבועי שאומר בחיוב שהקמפיינר דיבר עם הלקוח בטלפון נחשב שיחה; ניסוח שלילי כמו "לא הצלחתי לדבר" לא נחשב.
הבדיקה כוללת גם התראות קריטיות פתוחות (קמפיין שנעצר, מודעה שנדחתה) ללקוחות שטבלת הקמפיין שלהם פעילה.
לקמפיינרים הכלים מסננים אוטומטית ללקוחות המשויכים להם.
"בדיקת תקינות" היא health probe — לא דופק.$$,
  $$המקור היחיד למספרי הדופק הוא get_latest_campaign_pulse או refresh_campaign_pulse. אסור להשלים נתונים מהזיכרון, ואסור להריץ analyze_campaign_performance או check_ad_accounts_health במקום הדופק. בוואטסאפ אסור טבלאות — רק whatsapp_digest כלשונו. רענון לא שולח הודעות ולא מחליף אישור לשינוי בקמפיין.$$,
  $$1. בקשה בלי רענון — get_latest_campaign_pulse, בלי מסנן אלא אם צוינו לקוח או סוכנות.
2. בקשה לרענון או לדופק עדכני — refresh_campaign_pulse, עם client_id או client_name כשמדובר בלקוח אחד.
3. בוואטסאפ — הדביקי את whatsapp_digest כלשונו, כולל בלוק ההתראות הקריטיות. אחרי רענון פתחי בשורת refresh_note.
4. בדשבורד הפנימי — אפשר להציג את formatted_markdown.
5. אם count=0 — אמרי שאין בדיקת דופק שמורה והציעי לרענן.$$,
  $$בוואטסאפ — whatsapp_digest מהכלי בלבד (סיכום סטטוסים, בלוק "🔴 דורש טיפול" כשקיים וקישור לדשבורד); אחרי רענון, שורת refresh_note לפניו.
אסור: טבלת Markdown, רשימת לקוחות מלאה, או משפט על מה נמצא בדשבורד.$$,
  ARRAY['get_latest_campaign_pulse', 'refresh_campaign_pulse']::text[],
  -- Sorted like the ON CONFLICT branch, so a re-run changes nothing.
  ARRAY(
    SELECT DISTINCT phrase
    FROM unnest(ARRAY['בדיקת דופק', 'בדיקת דוח', 'סיכום קמפיינים', 'מצב קמפיינים', 'pulse check', 'דופק עדכני', 'רענני דופק', 'רענון דופק']::text[]) AS phrase
    ORDER BY phrase
  ),
  true,
  false
)
ON CONFLICT (slug) WHERE scope = 'global' DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  goal = EXCLUDED.goal,
  system_prompt = EXCLUDED.system_prompt,
  constraints = EXCLUDED.constraints,
  steps = EXCLUDED.steps,
  output_template = EXCLUDED.output_template,
  allowed_tools = EXCLUDED.allowed_tools,
  -- Keep trigger phrases added in the UI; add ours.
  triggers = ARRAY(
    SELECT DISTINCT phrase
    FROM unnest(COALESCE(skills.triggers, '{}'::text[]) || EXCLUDED.triggers) AS phrase
    ORDER BY phrase
  ),
  updated_at = now();

INSERT INTO public.ai_skills AS skills
  (slug, scope, tenant_id, name, description, goal, system_prompt, constraints, steps, output_template, allowed_tools, triggers, is_active, created_by_agent)
VALUES (
  'ecommerce_pulse',
  'global',
  NULL,
  $$דופק איקומרס$$,
  $$קריאת הדופק של לקוחות איקומרס לפי רכישות, הכנסות ו-ROAS ולא לפי עלות לליד.$$,
  $$לדווח על לקוחות איקומרס לפי מדדי המכירות שלהם מתוך בדיקת הדופק.$$,
  $$ללקוחות איקומרס (is_ecommerce=true, או יעד ecommerce בדופק) מודדים רכישות, הכנסות ו-ROAS — purchases_7d, revenue_7d, roas_7d ו-roas_change_pct — ולא CPL.
הנתונים מגיעים מ-get_latest_campaign_pulse, או מ-refresh_campaign_pulse כשמבקשים דופק עדכני.
ניתוח מעמיק ללקוח אחד, כשמבקשים אותו — analyze_campaign_performance עם client_id.
אין כלי שקורא הזמנות ישירות מ-Shopify או מ-WooCommerce. אל תציעי כלי כזה ואל תמציאי נתוני הזמנות.$$,
  $$כל מספר מגיע מפלט הכלים. אסור לחשב מדד שלא הופיע בפלט, ואסור להציג CPL כמדד ההצלחה של לקוח איקומרס.$$,
  $$1. get_latest_campaign_pulse (או refresh_campaign_pulse כשביקשו דופק עדכני) עם הלקוח או הסוכנות שצוינו.
2. ללקוחות איקומרס — דווחי רכישות, הכנסות ו-ROAS ואת השינוי ב-ROAS.
3. ניתוח מעמיק ללקוח אחד — analyze_campaign_performance עם client_id.$$,
  NULL,
  ARRAY['get_latest_campaign_pulse', 'refresh_campaign_pulse', 'analyze_campaign_performance']::text[],
  -- Sorted like the ON CONFLICT branch, so a re-run changes nothing.
  ARRAY(
    SELECT DISTINCT phrase
    FROM unnest(ARRAY['איקומרס', 'ecommerce', 'e-commerce', 'רכישות', 'roas', 'cpp']::text[]) AS phrase
    ORDER BY phrase
  ),
  true,
  false
)
ON CONFLICT (slug) WHERE scope = 'global' DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  goal = EXCLUDED.goal,
  system_prompt = EXCLUDED.system_prompt,
  constraints = EXCLUDED.constraints,
  steps = EXCLUDED.steps,
  output_template = EXCLUDED.output_template,
  allowed_tools = EXCLUDED.allowed_tools,
  -- Keep trigger phrases added in the UI; add ours.
  triggers = ARRAY(
    SELECT DISTINCT phrase
    FROM unnest(COALESCE(skills.triggers, '{}'::text[]) || EXCLUDED.triggers) AS phrase
    ORDER BY phrase
  ),
  updated_at = now();


DO $$
DECLARE
  v_overrides integer;
BEGIN
  SELECT count(*) INTO v_overrides
  FROM public.ai_skills
  WHERE slug IN ('pulse_check', 'ecommerce_pulse')
    AND scope = 'tenant';
  IF v_overrides > 0 THEN
    RAISE NOTICE 'AIO-237: % tenant override row(s) for pulse_check/ecommerce_pulse left unchanged; they still win over the updated global text.', v_overrides;
  END IF;
END;
$$;
