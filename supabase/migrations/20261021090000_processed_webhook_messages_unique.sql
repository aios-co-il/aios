-- Restore the unique key the webhook dedup relies on. The legacy table had
-- PRIMARY KEY (provider, tenant_id, external_message_id); the production
-- baseline dropped it, so duplicate Manus deliveries never hit 23505 and Carmen
-- replied twice. Keep the earliest row per tenant message, then enforce the key.

delete from public.processed_webhook_messages as dup
using public.processed_webhook_messages as keep
where dup.provider = keep.provider
  and dup.tenant_id = keep.tenant_id
  and dup.external_message_id = keep.external_message_id
  and (dup.processed_at, dup.ctid) > (keep.processed_at, keep.ctid);

create unique index if not exists processed_webhook_messages_provider_tenant_message_key
  on public.processed_webhook_messages (provider, tenant_id, external_message_id);
