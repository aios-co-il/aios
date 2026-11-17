-- WhatsApp unsubscribe replies (20261117090000_whatsapp_unsubscribe_reply):
-- synthetic broadcast, recipients and messages inside one rolled-back
-- transaction.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_other uuid;
  v_broadcast uuid;
  v_phone text := '97250' || lpad((floor(random() * 10000000))::int::text, 7, '0');
  v_stranger text := '97252' || lpad((floor(random() * 10000000))::int::text, 7, '0');
  v_count int;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT id INTO v_other FROM public.tenants WHERE id <> v_tenant ORDER BY id LIMIT 1;
  IF v_tenant IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'Requires two tenants';
  END IF;

  -- The matcher: whole-message phrases only, punctuation and case ignored.
  IF NOT public.broadcast_is_unsubscribe_reply('הסר') THEN
    RAISE EXCEPTION 'matcher: "הסר" must match';
  END IF;
  IF NOT public.broadcast_is_unsubscribe_reply('  הסירו אותי!! 🙏 ') THEN
    RAISE EXCEPTION 'matcher: punctuation and emoji must be ignored';
  END IF;
  IF NOT public.broadcast_is_unsubscribe_reply('STOP') THEN
    RAISE EXCEPTION 'matcher: "STOP" must match';
  END IF;
  IF public.broadcast_is_unsubscribe_reply('תסיר את הפגישה של מחר')
     OR public.broadcast_is_unsubscribe_reply('מה זה להסרה?? אני רוצה פרטים')
     OR public.broadcast_is_unsubscribe_reply(NULL) THEN
    RAISE EXCEPTION 'matcher: a sentence that only mentions removal must not match';
  END IF;

  -- v_phone received a mailing from v_tenant; v_stranger did not.
  INSERT INTO public.broadcasts (tenant_id, provider, name, status)
  VALUES (v_tenant, 'green_api', 'QA ROLLBACK unsubscribe reply', 'sent')
  RETURNING id INTO v_broadcast;
  INSERT INTO public.broadcast_recipients (broadcast_id, tenant_id, entity_type, phone, status)
  VALUES (v_broadcast, v_tenant, 'lead', v_phone, 'sent');

  -- An unrelated inbound message changes nothing.
  INSERT INTO public.chat_messages (tenant_id, direction, channel, provider, message_text, sender_phone)
  VALUES (v_tenant, 'inbound', 'whatsapp', 'green_api', 'תודה רבה', v_phone);
  -- The operator's own "הסר" and a stranger's "הסר" change nothing.
  INSERT INTO public.chat_messages (tenant_id, direction, channel, provider, message_text, sender_phone)
  VALUES (v_tenant, 'outbound', 'whatsapp', 'green_api', 'הסר', v_phone),
         (v_tenant, 'inbound', 'whatsapp', 'green_api', 'הסר', v_stranger);
  SELECT count(*) INTO v_count FROM public.broadcast_opt_outs
  WHERE phone IN (v_phone, v_stranger);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'guards: % opt-out rows before a recipient replied', v_count;
  END IF;

  -- The recipient replies "הסר" from a local-format number: blocked on all
  -- channels in its own tenant only, and a second reply adds nothing.
  INSERT INTO public.chat_messages (tenant_id, direction, channel, provider, message_text, sender_phone)
  VALUES (v_tenant, 'inbound', 'whatsapp', 'manus_wa', 'הסר', '0' || substr(v_phone, 4)),
         (v_tenant, 'inbound', 'whatsapp', 'green_api', 'הסירו אותי', v_phone);
  SELECT count(*) INTO v_count FROM public.broadcast_opt_outs
  WHERE tenant_id = v_tenant AND phone = v_phone AND channel = 'all'
    AND source = 'whatsapp_reply';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'reply: expected one opt-out row, found %', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.broadcast_opt_outs WHERE tenant_id = v_other AND phone = v_phone) THEN
    RAISE EXCEPTION 'tenant isolation: the reply blocked the phone in another tenant';
  END IF;

  RAISE NOTICE 'whatsapp_unsubscribe_reply: all checks passed';
END;
$test$;
ROLLBACK;
