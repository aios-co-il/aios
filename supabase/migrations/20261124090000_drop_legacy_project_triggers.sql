-- Drop three triggers that post to a Supabase project outside AIOS (AIO-66, AIO-198).
--
-- trigger_ad_account_blocked, trigger_auto_sync_new_lead and
-- trigger_carmen_learn_from_session call net.http_post on
-- https://jnzguisakdtcollxmgzd.supabase.co/functions/v1/... with that
-- project's anon key. The project is not in the AIOS organization (an old
-- Lovable-era project) and holds none of our rows, so these calls do none of
-- our work today; they only send lead, session and ad-account ids out.
--
-- Nothing here replaces them, on purpose:
-- - ad_account_blocked alerts already reach our own trigger-automation through
--   _shared/fireIntegrationAlert.ts (cron-sync-facebook-insights,
--   sync-google-search-console-data);
-- - carmen-learn-from-session is called by the app (CarmenChatBar, CarmenInsights);
-- - nothing in AIOS calls auto-sync-new-lead; pointing a trigger at it would
--   start ManyChat syncs that do not run today.
-- The edge functions stay. IF EXISTS keeps this a no-op where they are gone.

DROP TRIGGER IF EXISTS on_ad_account_blocked ON public.crm_tables;
DROP TRIGGER IF EXISTS auto_sync_new_lead_trigger ON public.leads;
DROP TRIGGER IF EXISTS carmen_session_close_learn ON public.carmen_whatsapp_sessions;

DROP FUNCTION IF EXISTS public.trigger_ad_account_blocked();
DROP FUNCTION IF EXISTS public.trigger_auto_sync_new_lead();
DROP FUNCTION IF EXISTS public.trigger_carmen_learn_from_session();
