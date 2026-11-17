-- AIO-559: a WhatsApp reply that asks to stop mailings ("הסר", "הסירו אותי",
-- "stop" ...) adds the sender's phone to the tenant's mailing blacklist
-- (broadcast_opt_outs, channel 'all', source 'whatsapp_reply'), the same
-- block the unsubscribe link writes, so mailings skip the contact on WhatsApp
-- and email (audience/reachability.ts re-checks at send time).
--
-- Kept in the database so every inbound path counts: Green API, Manus and
-- Meta webhooks all store private replies in chat_messages.
-- Guards against false positives:
--   * the whole message must be an unsubscribe phrase (not "תסיר את הפגישה");
--   * only inbound private chats, never groups or the operator's own sends;
--   * only a phone that received a mailing from this tenant.
-- No acknowledgement message is sent back.

-- Is this message, as a whole, a request to stop mailings?
CREATE OR REPLACE FUNCTION public.broadcast_is_unsubscribe_reply(p_text text)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT x.t IN (
    'הסר', 'הסרה', 'להסרה', 'הסירו', 'תסיר', 'תסירו',
    'הסר אותי', 'הסירו אותי', 'תסיר אותי', 'תסירו אותי',
    'נא להסיר', 'נא להסיר אותי', 'אבקש להסיר', 'אבקש להסיר אותי',
    'הסר אותי מהרשימה', 'הסירו אותי מהרשימה', 'הסרה מהרשימה',
    'stop', 'unsubscribe', 'remove', 'remove me'
  )
  FROM (
    -- Lower-case, punctuation and emoji to spaces, collapsed and trimmed.
    SELECT btrim(regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z֐-׿]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )) AS t
  ) x;
$$;

-- Blacklist the sender of an inbound private WhatsApp unsubscribe reply in
-- the message's tenant, when that phone received a mailing from the tenant.
CREATE OR REPLACE FUNCTION public.broadcast_opt_out_on_whatsapp_reply()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NULL;
  END IF;
  IF NOT public.broadcast_is_unsubscribe_reply(NEW.message_text) THEN
    RETURN NULL;
  END IF;

  v_phone := public.broadcast_normalize_phone(NEW.sender_phone);
  IF v_phone IS NULL OR NEW.tenant_id IS NULL THEN
    RAISE NOTICE 'broadcast_opt_out_on_whatsapp_reply: message % has no tenant or phone', NEW.id;
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.broadcast_recipients AS r
    WHERE r.tenant_id = NEW.tenant_id
      AND r.phone = v_phone
      AND r.entity_type <> 'wa_group'
      AND r.status IN ('sent', 'delivered', 'read')
  ) THEN
    RAISE NOTICE 'broadcast_opt_out_on_whatsapp_reply: % never received a mailing from tenant %', v_phone, NEW.tenant_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.broadcast_opt_outs (tenant_id, phone, channel, source)
  VALUES (NEW.tenant_id, v_phone, 'all', 'whatsapp_reply')
  ON CONFLICT (tenant_id, phone, channel) WHERE phone IS NOT NULL DO NOTHING;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Storing the inbound message matters more than the opt-out: log and go on.
  RAISE WARNING 'broadcast_opt_out_on_whatsapp_reply: message % not blacklisted: % (%)',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_opt_out_on_whatsapp_reply()
  FROM PUBLIC, anon, authenticated;

-- Only inbound private WhatsApp messages with text enter the function.
DROP TRIGGER IF EXISTS chat_messages_whatsapp_unsubscribe_reply ON public.chat_messages;
CREATE TRIGGER chat_messages_whatsapp_unsubscribe_reply
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  WHEN (
    NEW.direction = 'inbound'
    AND NEW.channel = 'whatsapp'
    AND NEW.group_id IS NULL
    AND NEW.message_text IS NOT NULL
  )
  EXECUTE FUNCTION public.broadcast_opt_out_on_whatsapp_reply();
