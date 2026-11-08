-- AIO-510: Carmen's own engine defaults to Gemini 3.5 Flash (David, 8 Nov 2026): fast and
-- cheap for her everyday turns. Every organization's active Carmen agent moves to it; the
-- run-ai-agent chain still fails over to GPT-5.4 Mini and Claude Sonnet when Gemini fails.
-- ai_agents has no triggers, so this update fires nothing else.
do $$
declare
  moved integer;
begin
  update public.ai_agents
  set engine = 'gemini-3.5-flash'
  where active
    and (name ilike '%carmen%' or name like '%כרמן%')
    and engine is distinct from 'gemini-3.5-flash';
  get diagnostics moved = row_count;
  raise notice 'Carmen agents moved to gemini-3.5-flash: %', moved;
end;
$$;
