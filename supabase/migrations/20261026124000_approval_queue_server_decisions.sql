-- AIO-230: Carmen approvals are decided only on the server.
--
-- carmen-approval-execute and resume-agent-run (service role) check the approver's
-- tenant and role, refuse expired rows, and claim a row once before it runs. The
-- approvals screen and bell keep read access, but browser roles can no longer insert,
-- edit or delete rows directly: a direct edit could rewrite tool_input, requested_by
-- or the conversation binding of a pending request, or queue a forged one.
--
-- No data changes and nothing is executed or sent. Safe to re-run.

drop policy if exists approval_insert on public.agent_approval_queue;
drop policy if exists approval_update on public.agent_approval_queue;

revoke all on table public.agent_approval_queue from public;
revoke all on table public.agent_approval_queue from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.agent_approval_queue from authenticated;

grant select on table public.agent_approval_queue to authenticated;
grant all on table public.agent_approval_queue to service_role;
