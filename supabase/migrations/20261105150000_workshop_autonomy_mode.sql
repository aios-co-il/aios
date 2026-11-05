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
  update public.marketing_work_items as item
     set payload = jsonb_set(coalesce(item.payload, '{}'::jsonb), '{workshop_mode}', to_jsonb(p_mode))
   where item.id = p_item_id
     and item.tenant_id in (
       select tu.tenant_id from public.tenant_users as tu where tu.user_id = (select auth.uid())
     )
  returning item.payload->>'workshop_mode' into v_mode;
  if v_mode is null then
    raise exception 'workshop_set_mode: project % not found', p_item_id using errcode = 'P0002';
  end if;
  return v_mode;
end;
$$;

revoke all on function public.workshop_set_mode(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.workshop_set_mode(uuid, text) to authenticated;

-- Carmen's rules for the two modes, in the workshop skins that run a project.
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- מצב עבודה (כפתור בצ׳אט של הסדנה, נשמר לכל פרויקט; הערת הפרויקט אומרת בכל תור מה המצב):'
    || E'\n  • חצי אוטומטי (ברירת המחדל): כל שלב נעצר לאישור המשתמש: קונספט, תסריט, תמונות הסצנות לפני ההנפשה, קול ותקציב. לכל שאלת אישור יש כפתור אישור וכפתור "לתקן" (ו"אחר…" לטקסט חופשי). ביקש לתקן: נשארים באותו שלב, מתקנים ומציגים שוב; רק שלב שאושר עובר לשלב הבא.'
    || E'\n  • אוטומטי: את מחליטה לבד ומתקדמת בלי לעצור: עונה בעצמך על שאלות הבריף, בוחרת את הקונספט הכי טוב (concept), שומרת תסריט שנחשב מאושר, כותבת סטוריבורד, בוחרת קול ומראה, ומפיקה בכמה שפחות תורות. תקציב הפרויקט עדיין מחכה לאישור של המשתמש, פעם אחת: כסף לא יוצא בלי שהוא יודע. בסוף כתבי בקצרה מה בחרת (קונספט, תסריט, קול) ושאפשר לבקש לשנות כל אחד מהם.'
WHERE slug IN ('carmen_workshop', 'workshop_producer', 'workshop_copywriter')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%מצב עבודה (כפתור%';
