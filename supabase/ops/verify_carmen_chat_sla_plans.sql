-- Ops: read-only plan check for the chat collector's reads in
-- 20261101101000_carmen_chat_sla.sql (AIO-252). Run on Staging (or the PR's
-- Preview branch) after the migration applies there, with real literals in
-- place of the <placeholders>, and paste the output in the PR body.
--
-- The functions are SECURITY DEFINER with a fixed search_path, so PostgreSQL
-- never inlines them and EXPLAIN of a call shows only a Function Scan; these
-- queries repeat their hot reads instead. A Seq Scan on chat_messages in (a),
-- (b) or (d) means a new index, shipped alone in its own migration as
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS (one statement, outside a
-- transaction), or as a plain CREATE INDEX merged at a low-traffic hour.

SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'chat_messages';
SELECT pg_size_pretty(pg_total_relation_size('public.chat_messages'));

-- (a) The activity read (messages CTE): expect an Index Scan or Bitmap Index
--     Scan on idx_chat_messages_provider (tenant_id, provider, created_at DESC).
EXPLAIN SELECT cm.id FROM public.chat_messages AS cm
WHERE cm.tenant_id = '<tenant>' AND cm.provider = 'green_api'
  AND cm.connection_user_id = ANY ('{<green line owner>}'::uuid[])
  AND cm.created_at >= now() - interval '7 days' AND cm.is_blocked = false;

-- (b) The shared-group check (group_threads NOT EXISTS), for a group of the
--     client's own tenant: expect an Index Scan on idx_chat_messages_group,
--     idx_chat_messages_group_id or idx_chat_messages_provider.
EXPLAIN SELECT 1 FROM public.chat_messages AS ocm
WHERE ocm.group_id = '<whatsapp_groups.id>' AND ocm.tenant_id = '<client tenant>'
  AND ocm.provider = 'green_api' AND ocm.created_at >= now() - interval '7 days'
LIMIT 1;

-- (c) The direct-chat client lookup (key_clients): a scan of clients for the
--     tenant only (idx_clients_tenant_*), and of client_contacts by client_id.
EXPLAIN SELECT public.phone_match_key(c.phone) FROM public.clients AS c
WHERE c.tenant_id = '<tenant>' AND c.status NOT IN ('ended', 'inactive');

-- (d) get_unlinked_client_groups (traffic CTE): idx_chat_messages_provider as in (a).
EXPLAIN SELECT cm.group_id, count(*) FROM public.chat_messages AS cm
WHERE cm.tenant_id = '<tenant>' AND cm.provider = 'green_api'
  AND cm.connection_user_id = ANY ('{<green line owner>}'::uuid[])
  AND cm.group_id IS NOT NULL AND cm.created_at >= now() - interval '7 days'
  AND cm.is_blocked = false
GROUP BY cm.group_id;

-- (e) The round's call read (collectors/chat/calls.ts): an Index Scan on
--     idx_call_logs_tenant; AIO-253 plans a (tenant_id, client_id,
--     created_at) index after its own size check.
EXPLAIN SELECT client_id, created_at FROM public.call_logs
WHERE tenant_id IN ('<tenant>') AND status = 'completed' AND client_id IS NOT NULL
  AND created_at >= now() - interval '7 days';

-- (f) carmen_round_llm_spend's month sums: Index Scans on
--     idx_ai_usage_log_created; agent_action_log and marketing_runs have no
--     created_at-first index, so a Seq Scan there is expected (the health
--     probe reads the same rows hourly).
EXPLAIN SELECT sum(cost_usd) FROM public.agent_action_log
WHERE created_at >= date_trunc('month', now());
