-- AIO-230: Carmen approvals are decided only on the server.
--
-- carmen-approval-execute and resume-agent-run (service role) check the approver's
-- tenant and role, refuse expired rows, and claim a row once before it runs. The
-- approvals screen and bell keep read access, but browser roles can no longer insert,
-- edit or delete rows directly: a direct edit could rewrite tool_input, requested_by
-- or the conversation binding of a pending request, or queue a forged one.
--
-- One data change: the learned skin wa_meta_approval_confirm_flow told Carmen
-- that a bare "כן" runs the latest pending Meta approval, which this change no
-- longer allows, so it is turned off (the approval pick rule in run-ai-agent
-- replaces it). Nothing is executed or sent. Safe to re-run.

-- approval_insert: WITH CHECK (true) let any role queue any row.
drop policy if exists approval_insert on public.agent_approval_queue;

-- approval_update: let any tenant member rewrite any column of their tenant's rows.
drop policy if exists approval_update on public.agent_approval_queue;

revoke all on table public.agent_approval_queue from public;
revoke all on table public.agent_approval_queue from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.agent_approval_queue from authenticated;

grant select on table public.agent_approval_queue to authenticated;
grant all on table public.agent_approval_queue to service_role;

-- Retire the learned skin that contradicts the bound approval rule (any org).
update public.ai_skills
set is_active = false
where slug = 'wa_meta_approval_confirm_flow'
  and is_active;
