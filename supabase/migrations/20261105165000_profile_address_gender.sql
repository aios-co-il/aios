-- How Carmen addresses a user in Hebrew, where every verb carries gender
-- (_shared/carmen/user-address.ts). NULL means unknown, and Carmen then uses the plural, never the
-- feminine. Users set their own value from their profile page under the existing
-- "Users can update their own profile" policy. Safe to re-run.

alter table public.profiles add column if not exists gender text;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female'));

comment on column public.profiles.gender is
  'How Carmen addresses this user in Hebrew: male, female, or NULL for the plural.';

-- The copywriter skin follows the user-address line instead of always writing neutral. A NOTICE
-- says when the old sentence is missing (an edited or already-updated skin), so a silent no-op
-- shows in the deploy log.
do $$
declare
  changed integer;
begin
  update public.ai_skills set
    system_prompt = replace(
      system_prompt,
      '- פנייה למשתמש בלשון ניטרלית ("אפשר לבחור"), לא "תבחרי" או "תבחר".',
      '- פנייה למשתמש לפי שורת הפנייה למשתמש. כשהמגדר לא ידוע: בלשון רבים או ניטרלית ("אפשר לבחור", "בחרו"), אף פעם לא בלשון נקבה כברירת מחדל.'
    )
  where slug = 'workshop_copywriter'
    and scope = 'global'
    and position('- פנייה למשתמש בלשון ניטרלית ("אפשר לבחור"), לא "תבחרי" או "תבחר".' in system_prompt) > 0;
  get diagnostics changed = row_count;
  if changed = 0 then
    raise notice 'workshop_copywriter skin: neutral-address sentence not found, skin left unchanged';
  end if;
end
$$;
