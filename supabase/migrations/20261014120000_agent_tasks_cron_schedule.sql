-- Carmen tasks panel: real cron schedules + per-task engine for agent_tasks.
--
-- * next_run      — when dispatch-agent-tasks should run a cron-scheduled
--                   recurring task (schedule_type = 'recurring'). Set by the
--                   UI on create/edit; moved forward by the dispatcher on each
--                   claim. NULL = not scheduled by cron.
-- * timezone      — zone used to evaluate cron_expression (default Israel).
-- * engine_model  — optional per-task engine (passed to run-ai-agent as a
--                   service-only model_override). NULL = the agent's engine.
--
-- No existing row is changed: tasks created before this migration keep
-- next_run = NULL, so nothing old is started or replayed by this change.

ALTER TABLE public.agent_tasks
  ADD COLUMN IF NOT EXISTS next_run timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  ADD COLUMN IF NOT EXISTS engine_model text;

ALTER TABLE public.agent_tasks ALTER COLUMN enabled SET DEFAULT true;

CREATE INDEX IF NOT EXISTS agent_tasks_cron_due_idx
  ON public.agent_tasks (next_run)
  WHERE next_run IS NOT NULL AND schedule_type = 'recurring';

COMMENT ON COLUMN public.agent_tasks.next_run IS
  'Next cron run for schedule_type=recurring (UI-set, dispatcher-advanced). NULL = not cron-scheduled.';
COMMENT ON COLUMN public.agent_tasks.timezone IS
  'IANA zone for cron_expression (default Asia/Jerusalem).';
COMMENT ON COLUMN public.agent_tasks.engine_model IS
  'Optional per-task engine override; NULL = the agent''s own engine.';
