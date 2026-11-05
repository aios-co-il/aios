-- The workshop chat's automatic / semi-automatic toggle (_shared/workshop/workshop-mode.ts). Safe to re-run.
--
-- workshop_set_mode: stores the project's mode in payload.workshop_mode ('auto' or 'semi'); the
-- edge function reads it on every turn. Semi-automatic (the default, also when the key is absent)
-- stops at every stage for the user's approval; automatic lets Carmen choose the concept, script,
-- storyboard, voice and look herself, and only the project's budget waits for the user.
--
-- Security definer with an explicit membership check, like workshop_edit_page: the project is
-- found only for a member of its own tenant (anyone else gets "not found"), the write stays in
-- that tenant, and only this one payload key changes. Not security invoker: the
-- marketing_work_items policies cover only the user's active tenant.

-- Sets the open workshop project's mode for a member of its tenant and returns the stored mode.
create or replace function public.workshop_set_mode(p_item_id uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
begin
  if p_mode is null or p_mode not in ('auto', 'semi') then
    raise exception 'workshop_set_mode: the mode is auto or semi' using errcode = '22023';
  end if;
  -- workshop_keep_mode lets only this function change the key.
  perform set_config('aios.workshop_mode_write', 'on', true);
  update public.marketing_work_items as item
     set payload = jsonb_set(coalesce(item.payload, '{}'::jsonb), '{workshop_mode}', to_jsonb(p_mode))
   where item.id = p_item_id
     and item.tenant_id in (
       select tu.tenant_id from public.tenant_users as tu where tu.user_id = (select auth.uid())
     )
  returning item.payload->>'workshop_mode' into v_mode;
  perform set_config('aios.workshop_mode_write', 'off', true);
  if v_mode is null then
    raise exception 'workshop_set_mode: project % not found', p_item_id using errcode = 'P0002';
  end if;
  return v_mode;
end;
$$;

revoke all on function public.workshop_set_mode(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.workshop_set_mode(uuid, text) to authenticated;

-- Keeps payload.workshop_mode as stored on every other payload write, in the same statement: a
-- tool saving the payload copy it loaded earlier (or after a failed read) can never undo the
-- user's switch, however the save and the switch interleave. Only workshop_set_mode changes it.
create or replace function public.workshop_keep_mode()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_setting('aios.workshop_mode_write', true), '') = 'on'
     or (new.payload -> 'workshop_mode') is not distinct from (old.payload -> 'workshop_mode') then
    return new;
  end if;
  new.payload := case
    when old.payload ? 'workshop_mode'
      then jsonb_set(coalesce(new.payload, '{}'::jsonb), '{workshop_mode}', old.payload -> 'workshop_mode')
    else coalesce(new.payload, '{}'::jsonb) - 'workshop_mode'
  end;
  return new;
end;
$$;

drop trigger if exists workshop_keep_mode on public.marketing_work_items;
create trigger workshop_keep_mode
  before update of payload on public.marketing_work_items
  for each row execute function public.workshop_keep_mode();

-- Carmen's rules for the two modes, in the workshop skins that run a project.
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- מצב עבודה (כפתור בצ׳אט של הסדנה, נשמר לכל פרויקט; הערת הפרויקט אומרת בכל תור מה המצב):'
    || E'\n  • חצי אוטומטי (ברירת המחדל): כל שלב נעצר לאישור המשתמש: קונספט, תסריט, תמונות הסצנות לפני ההנפשה, קול ותקציב. לכל שאלת אישור יש כפתור אישור וכפתור "לתקן" (ו"אחר…" לטקסט חופשי). ביקש לתקן: נשארים באותו שלב, מתקנים ומציגים שוב; רק שלב שאושר עובר לשלב הבא.'
    || E'\n  • אוטומטי: את מחליטה לבד ומתקדמת בלי לעצור: עונה בעצמך על שאלות הבריף, בוחרת את הקונספט הכי טוב (concept), שומרת תסריט שנחשב מאושר, כותבת סטוריבורד, בוחרת קול ומראה, ומפיקה בכמה שפחות תורות. תקציב הפרויקט עדיין מחכה לאישור של המשתמש, פעם אחת: כסף לא יוצא בלי שהוא יודע. בסוף כתבי בקצרה מה בחרת (קונספט, תסריט, קול) ושאפשר לבקש לשנות כל אחד מהם.'
WHERE slug IN ('carmen_workshop', 'workshop_producer', 'workshop_copywriter')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%מצב עבודה (כפתור%';
