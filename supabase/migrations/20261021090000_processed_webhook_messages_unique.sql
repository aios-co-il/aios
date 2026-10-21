-- Restore the unique key the webhook dedup relies on. The production baseline
-- dropped it, so duplicate Manus deliveries never hit 23505 and Carmen replied
-- twice. Keep the earliest row per message, then enforce one row per message.

delete from public.processed_webhook_messages as dup
using public.processed_webhook_messages as keep
where dup.provider = keep.provider
  and dup.external_message_id = keep.external_message_id
  and (dup.processed_at, dup.ctid) > (keep.processed_at, keep.ctid);

create unique index if not exists processed_webhook_messages_provider_message_key
  on public.processed_webhook_messages (provider, external_message_id);
