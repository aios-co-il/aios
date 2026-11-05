-- How Carmen addresses a user in Hebrew, where every verb carries gender
-- (run-ai-agent/user-address.ts). NULL means unknown, and Carmen then uses the plural, never the
-- feminine. Users set their own value from their profile page under the existing
-- "Users can update their own profile" policy. Safe to re-run.

alter table public.profiles add column if not exists gender text;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female'));

comment on column public.profiles.gender is
  'How Carmen addresses this user in Hebrew: male, female, or NULL for the plural.';

-- The copywriter skin follows the user-address line instead of always writing neutral.
update public.ai_skills set
  system_prompt = replace(
    system_prompt,
    '- פנייה למשתמש בלשון ניטרלית ("אפשר לבחור"), לא "תבחרי" או "תבחר".',
    '- פנייה למשתמש לפי שורת הפנייה למשתמש. כשהמגדר לא ידוע: בלשון רבים או ניטרלית ("אפשר לבחור", "בחרו"), אף פעם לא בלשון נקבה כברירת מחדל.'
  )
where slug = 'workshop_copywriter' and scope = 'global';
