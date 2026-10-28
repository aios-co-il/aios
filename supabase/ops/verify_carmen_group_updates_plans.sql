-- Ops: read-only plan check for get_client_group_digest_messages in
-- 20261027103000_carmen_group_updates.sql (AIO-254). Run on Staging (or the
-- PR's Preview branch) after the migration applies there, with real literals
-- in place of the <placeholders>, and paste the output in the PR.
--
-- The function is SECURITY DEFINER with a fixed search_path, so PostgreSQL
-- never inlines it and EXPLAIN of a call shows only a Function Scan; these
-- queries repeat its hot reads instead. A Seq Scan on chat_messages in (a) or
-- (b) means a new index, shipped alone in its own migration as
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS (one statement, outside a
-- transaction), or as a plain CREATE INDEX merged at a low-traffic hour.

SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'chat_messages';
SELECT pg_size_pretty(pg_total_relation_size('public.chat_messages'));

-- (a) The window read (windowed CTE): expect an Index Scan or Bitmap Index
--     Scan on idx_chat_messages_provider (tenant_id, provider, created_at
--     DESC) or idx_chat_messages_group.
EXPLAIN SELECT m.id FROM public.chat_messages AS m
WHERE m.tenant_id = '<tenant>' AND m.provider = 'green_api'
  AND m.connection_user_id = ANY ('{<green line owner>}'::uuid[])
  AND m.group_id = ANY ('{<linked whatsapp_groups.id>}'::uuid[])
  AND m.created_at > now() - interval '1 day' AND NOT m.is_blocked;

-- (b) The shared-group check (scoped NOT EXISTS), for a group of the
--     client's own tenant: expect an Index Scan on idx_chat_messages_group
--     or idx_chat_messages_provider.
EXPLAIN SELECT 1 FROM public.chat_messages AS ocm
WHERE ocm.group_id = '<whatsapp_groups.id>' AND ocm.tenant_id = '<client tenant>'
  AND ocm.provider = 'green_api' AND ocm.created_at > now() - interval '1 day'
LIMIT 1;
