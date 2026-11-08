-- AIO-510: Carmen speaks as a professional, efficient marketing manager (David, 8 Nov 2026):
-- every organization's active Carmen agent takes the "focused" mood, whose text now says
-- exactly that (_shared/carmen/agent-mood.ts), instead of "fun". ai_agents has no
-- triggers, so this update fires nothing else.
do $$
declare
  moved integer;
begin
  update public.ai_agents
  set mood = 'focused'
  where active
    and (name ilike '%carmen%' or name like '%כרמן%')
    and mood is distinct from 'focused';
  get diagnostics moved = row_count;
  raise notice 'Carmen agents moved to the focused mood: %', moved;
end;
$$;
