-- Per-tenant cap on Carmen/agent tasks running at the same time.
-- dispatch-agent-tasks defers due tasks to the next tick once the cap is hit.
ALTER TABLE public.tenant_heartbeat_settings
  ADD COLUMN IF NOT EXISTS max_concurrent_tasks integer NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_heartbeat_settings_max_concurrent_tasks_check'
  ) THEN
    ALTER TABLE public.tenant_heartbeat_settings
      ADD CONSTRAINT tenant_heartbeat_settings_max_concurrent_tasks_check
      CHECK (max_concurrent_tasks BETWEEN 1 AND 20);
  END IF;
END $$;

COMMENT ON COLUMN public.tenant_heartbeat_settings.max_concurrent_tasks IS
  'Max agent_tasks running in parallel for the tenant (dispatcher cap, default 3).';
