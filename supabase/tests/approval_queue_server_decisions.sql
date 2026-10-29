-- Approval queue grants (20261026124000_approval_queue_server_decisions):
-- browsers read the queue but never write it; anon cannot read it. Read-only checks
-- inside a transaction that is rolled back.
BEGIN;
DO $test$
BEGIN
  IF has_table_privilege('authenticated', 'public.agent_approval_queue', 'INSERT')
     OR has_table_privilege('authenticated', 'public.agent_approval_queue', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.agent_approval_queue', 'DELETE') THEN
    RAISE EXCEPTION 'grants: members must not insert, update or delete approval rows';
  END IF;

  IF has_table_privilege('anon', 'public.agent_approval_queue', 'SELECT') THEN
    RAISE EXCEPTION 'grants: anon must not read the approval queue';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.agent_approval_queue', 'SELECT') THEN
    RAISE EXCEPTION 'grants: members must still read the approval queue';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_approval_queue'
      AND policyname IN ('approval_insert', 'approval_update')
  ) THEN
    RAISE EXCEPTION 'policies: approval_insert / approval_update must be dropped';
  END IF;
END
$test$;
ROLLBACK;
