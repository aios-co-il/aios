-- PR 932 review (chiptus): the workshop and video RPCs this PR grants to authenticated are not
-- callable by anon. Safe to re-run.
--
-- A new function is executable by PUBLIC, and in Supabase the schema's default privileges also
-- grant it to anon; a GRANT to authenticated adds a role and takes none away. Each function is
-- security invoker, so anon met RLS, but it should not reach them at all. Callers: the signed-in
-- app and Carmen's tools (authenticated), edge functions and the render worker (service role).
-- claim_video_run belongs to the render worker: the service role only (its body checks too).
-- workshop_edit_scene_text (authenticated only) and patch_marketing_work_item (service role
-- only) already revoke what they do not need.

revoke all on function public.video_narration_ready(uuid) from public, anon;
revoke all on function public.attach_video_narration(uuid, text, jsonb, uuid, jsonb) from public, anon;
revoke all on function public.queue_video_sound(uuid, text, uuid[], text, jsonb, uuid, text, text) from public, anon;
revoke all on function public.advance_video_production(uuid) from public, anon;
revoke all on function public.produce_video(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean, boolean)
  from public, anon;
revoke all on function public.workshop_creative_stage(uuid, uuid) from public, anon;
revoke all on function public.workshop_assign_client(uuid, uuid) from public, anon;
revoke all on function public.video_talking_line(jsonb, text) from public, anon;
revoke all on function public.video_narration_line(jsonb, text) from public, anon;
revoke all on function public.queue_video_lipsync(uuid, uuid[], jsonb, uuid, boolean) from public, anon;
revoke all on function public.save_video_storyboard(uuid, jsonb) from public, anon;
revoke all on function public.video_voice_matches(jsonb, text) from public, anon;
revoke all on function public.claim_video_run(text[], text) from public, anon, authenticated;

grant execute on function public.video_narration_ready(uuid) to authenticated, service_role;
grant execute on function public.attach_video_narration(uuid, text, jsonb, uuid, jsonb) to authenticated, service_role;
grant execute on function public.queue_video_sound(uuid, text, uuid[], text, jsonb, uuid, text, text) to authenticated, service_role;
grant execute on function public.advance_video_production(uuid) to authenticated, service_role;
grant execute on function public.produce_video(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean, boolean)
  to authenticated, service_role;
grant execute on function public.workshop_creative_stage(uuid, uuid) to authenticated, service_role;
grant execute on function public.workshop_assign_client(uuid, uuid) to authenticated, service_role;
grant execute on function public.video_talking_line(jsonb, text) to authenticated, service_role;
grant execute on function public.video_narration_line(jsonb, text) to authenticated, service_role;
grant execute on function public.queue_video_lipsync(uuid, uuid[], jsonb, uuid, boolean) to authenticated, service_role;
grant execute on function public.save_video_storyboard(uuid, jsonb) to authenticated, service_role;
grant execute on function public.video_voice_matches(jsonb, text) to authenticated, service_role;
grant execute on function public.claim_video_run(text[], text) to service_role;
