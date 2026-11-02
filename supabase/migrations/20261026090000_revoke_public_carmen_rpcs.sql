-- These SECURITY DEFINER functions act with owner rights but were executable by
-- anon and authenticated, so anyone holding the public API key could call them:
--   claude_notify_david            sends WhatsApp from Carmen's line to any chat_id
--   carmen_send_activation         sends an activation code to any phone
--   carmen_fix_campaigner_access   inserts a client_team row
-- Every caller is server-side: edge functions with the service role, coding
-- agents through the Supabase connector, and the SECURITY DEFINER trigger
-- carmen_allowed_phones_trigger (runs as postgres). Keep them server-only.
REVOKE ALL ON FUNCTION public.claude_notify_david(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_send_activation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carmen_fix_campaigner_access(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claude_notify_david(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_send_activation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.carmen_fix_campaigner_access(uuid, uuid, uuid) TO service_role;
