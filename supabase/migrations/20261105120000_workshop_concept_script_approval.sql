-- The user approves and edits a film's concept and script on the workshop board. Safe to re-run.
--
-- workshop_edit_page: the board edits a concept page's text, or a script page's beats (narration,
-- on-screen text and visual; the timing stays as written, so the script still fits the film).
-- A script page that is the project's current script (payload.workshop_script.artifact_id) also
-- updates the script the storyboard is built from, and its approval is cleared: the user approves
-- the edited script like any new one (_shared/workshop/film-script.ts). Once the storyboard is
-- written from the script, its scenes are edited instead (workshop_edit_scene_text).
--
-- Security definer with an explicit membership check: the page is looked up for a member of its
-- own tenant only, so anyone else (a super admin included) gets "not found", and every write is
-- kept to the page's tenant. Not security invoker: the marketing_work_items select policy covers
-- only the user's active tenant (get_user_tenant_id), so for a member editing another of their
-- tenants the page changed while the project's script kept its approval.

create or replace function public.workshop_edit_page(
  p_artifact_id uuid,
  p_text text default null,
  p_beats jsonb default null
)
returns public.workshop_artifacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.workshop_artifacts;
  v_text text := left(btrim(coalesce(p_text, '')), 8000);
  v_stored jsonb;
  v_beats jsonb;
begin
  select * into v_page
    from public.workshop_artifacts as page
   where page.id = p_artifact_id
     and page.tenant_id in (
       select tu.tenant_id from public.tenant_users as tu where tu.user_id = (select auth.uid())
     )
   for update;
  if not found then
    raise exception 'workshop_edit_page: page % not found', p_artifact_id using errcode = 'P0002';
  end if;
  if v_page.kind not in ('concept', 'script') then
    raise exception 'workshop_edit_page: only a concept or a script page is edited here'
      using errcode = '22023';
  end if;
  if v_text = '' then
    raise exception 'workshop_edit_page: the page needs its text' using errcode = '22023';
  end if;

  if v_page.kind = 'concept' then
    update public.workshop_artifacts as page
       set meta = coalesce(page.meta, '{}'::jsonb)
         || jsonb_build_object('text', left(v_text, 4000), 'edited_by_user', true)
     where page.id = v_page.id
    returning page.* into v_page;
    return v_page;
  end if;

  if exists (
    select 1 from public.marketing_video_scenes as scene
     where scene.item_id = v_page.item_id and scene.tenant_id = v_page.tenant_id
  ) then
    raise exception 'workshop_edit_page: the storyboard is already written from this script'
      using errcode = '55000';
  end if;
  v_stored := coalesce(v_page.meta->'beats', '[]'::jsonb);
  if jsonb_typeof(p_beats) is distinct from 'array'
     or jsonb_array_length(v_stored) = 0
     or jsonb_array_length(p_beats) <> jsonb_array_length(v_stored) then
    raise exception 'workshop_edit_page: a script keeps its beats and their count'
      using errcode = '22023';
  end if;

  -- Each beat keeps its stored timing and takes the user's texts, cut to the save tool's limits.
  select jsonb_agg(
           jsonb_build_object(
             'start_s', stored.beat->'start_s',
             'end_s', stored.beat->'end_s',
             'narration', left(btrim(coalesce(given.beat->>'narration', '')), 1000),
             'on_screen', left(btrim(coalesce(given.beat->>'on_screen', '')), 300),
             'visual', left(btrim(coalesce(given.beat->>'visual', '')), 1000)
           )
           order by n
         )
    into v_beats
    from jsonb_array_elements(v_stored) with ordinality as stored(beat, n)
    join jsonb_array_elements(p_beats) with ordinality as given(beat, n) using (n);
  if exists (
    select 1 from jsonb_array_elements(v_beats) as edited(beat)
     where edited.beat->>'narration' = '' and edited.beat->>'on_screen' = ''
  ) then
    raise exception 'workshop_edit_page: every beat needs narration or on-screen text'
      using errcode = '22023';
  end if;

  update public.workshop_artifacts as page
     set meta = coalesce(page.meta, '{}'::jsonb)
       || jsonb_build_object('beats', v_beats, 'text', v_text, 'edited_by_user', true)
   where page.id = v_page.id
  returning page.* into v_page;

  -- The project's script follows its page and waits for the user's approval again.
  update public.marketing_work_items as item
     set payload = jsonb_set(
       item.payload,
       '{workshop_script}',
       (item.payload->'workshop_script') || jsonb_build_object(
         'beats', v_beats,
         'approved', false,
         'approved_turn', null,
         'saved_turn', null,
         'edited_by_user', true
       )
     )
   where item.id = v_page.item_id
     and item.tenant_id = v_page.tenant_id
     and item.payload->'workshop_script'->>'artifact_id' = v_page.id::text;
  return v_page;
end;
$$;

revoke all on function public.workshop_edit_page(uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.workshop_edit_page(uuid, text, jsonb) to authenticated;

-- Carmen's rules for the concept and script steps, in the workshop skins that write films.
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- סרט חדש: התשובה הראשונה עוסקת בבריף ובקונספטים, לא בתסריט. לא כותבים תסריט או טבלת סצנות בתשובה עצמה ולא ממציאים כפתור אישור לתסריט: תסריט נכתב רק ב-workshop_save_script, והכפתור שהוא מציג הוא האישור היחיד שלו.'
    || E'\n- הקונספט הוא בחירה של המשתמש: concept (או "קונספט" ב-brief_answers) רק כשהוא בחר בכפתור, ענה במילים על שאלת הקונספט או תיאר קונספט משלו. קונספט שהמצאת נדחה. כפתור "אישור הקונספט" בלוח שולח "קונספט: <שם>", והבחירה נשמרת לבריף לבד.'
    || E'\n- עמוד מסומן בלוח: קונספט עם הערות → כתבי רק אותו מחדש ושמרי ב-workshop_save_concepts באותו שם. תסריט עם הערות → כתבי אותו מחדש ושמרי ב-workshop_save_script, והאישור מתאפס. המשתמש יכול גם לערוך קונספט ותסריט בעצמו בלוח; תסריט שערך ממתין לאישור שלו, ולא כותבים אותו מחדש בלי בקשה.'
WHERE slug IN ('carmen_workshop', 'workshop_producer', 'workshop_copywriter')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%אישור הקונספט%';
