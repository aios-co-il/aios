-- Read-only check for 20261026125000_carmen_chat_scope_connections.sql (AIO-231).
-- Run on the Preview branch or Staging after the migration applies, then once
-- on Production after the merge (service role or psql). Writes nothing.
--
-- get_chat_contacts now takes its connection rule from
-- chat_allowed_connection_user_ids; the rest of its body is unchanged. So it
-- returns the same rows as before exactly when the helper equals the old inline
-- rule for every tenant member. Expected result of query 1: zero rows.

-- 1) Members whose helper result differs from the old inline rule.
WITH members AS (
  SELECT DISTINCT tu.tenant_id, tu.user_id
  FROM public.tenant_users tu
  WHERE tu.tenant_id IS NOT NULL
    AND tu.user_id IS NOT NULL
),
compared AS (
  SELECT
    m.tenant_id,
    m.user_id,
    (
      SELECT array_agg(x ORDER BY x)
      FROM unnest(public.chat_allowed_connection_user_ids(m.tenant_id, m.user_id)) x
    ) AS helper,
    (
      SELECT array_agg(DISTINCT owners.owner_id ORDER BY owners.owner_id)
      FROM (
        SELECT m.user_id AS owner_id
        UNION
        SELECT ti.user_id
        FROM public.tenant_integrations ti
        WHERE ti.tenant_id = m.tenant_id
          AND ti.user_id IS NOT NULL
          AND (
            COALESCE(public.is_super_admin(m.user_id), false)
            OR ti.user_id = m.user_id
            OR ti.connection_visibility = 'org'
            OR EXISTS (
              SELECT 1
              FROM public.integration_user_permissions iup
              WHERE iup.integration_id = ti.id
                AND iup.user_id = m.user_id
            )
          )
      ) owners
    ) AS old_inline_rule
  FROM members m
)
SELECT tenant_id, user_id, helper, old_inline_rule
FROM compared
WHERE helper IS DISTINCT FROM old_inline_rule;

-- 2) Only the service role may call the helper; get_chat_contacts grants unchanged.
SELECT
  has_function_privilege('anon', 'public.chat_allowed_connection_user_ids(uuid,uuid)', 'EXECUTE') AS anon_can_call_helper,          -- expect false
  has_function_privilege('authenticated', 'public.chat_allowed_connection_user_ids(uuid,uuid)', 'EXECUTE') AS authenticated_can_call_helper, -- expect false
  has_function_privilege('service_role', 'public.chat_allowed_connection_user_ids(uuid,uuid)', 'EXECUTE') AS service_role_can_call_helper,   -- expect true
  has_function_privilege('authenticated', 'public.get_chat_contacts(uuid,uuid[],chat_provider)', 'EXECUTE') AS authenticated_can_call_contacts; -- expect true
