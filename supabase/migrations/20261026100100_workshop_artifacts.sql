-- The pages of Carmen's workshop board: one row per thing Carmen produced for a project.
-- Rows point at the existing asset, variation or scene (ref_table/ref_id); nothing is copied.

create table if not exists public.workshop_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.marketing_work_items(id) on delete cascade,
  kind text not null check (kind in (
    'brief', 'concept', 'copy', 'image', 'variation', 'storyboard', 'scene_still',
    'clip', 'narration', 'music', 'film', 'reference', 'article'
  )),
  -- Logical project folder: '', copy, images, video/scenes, video/film, video/narration, video/music, references.
  folder text not null default '',
  title text not null default '',
  status text not null default 'ready' check (status in ('pending', 'ready', 'failed', 'approved')),
  url text,
  thumb_url text,
  ref_table text,
  ref_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workshop_artifacts_item_created_idx
  on public.workshop_artifacts (item_id, created_at);
create index if not exists workshop_artifacts_tenant_idx
  on public.workshop_artifacts (tenant_id);

alter table public.workshop_artifacts enable row level security;

grant select, insert, update, delete on public.workshop_artifacts to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_artifacts' and policyname = 'workshop_artifacts_select') then
    create policy workshop_artifacts_select on public.workshop_artifacts for select to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_artifacts' and policyname = 'workshop_artifacts_insert') then
    create policy workshop_artifacts_insert on public.workshop_artifacts for insert to authenticated
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_artifacts' and policyname = 'workshop_artifacts_update') then
    create policy workshop_artifacts_update on public.workshop_artifacts for update to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())))
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_artifacts' and policyname = 'workshop_artifacts_delete') then
    create policy workshop_artifacts_delete on public.workshop_artifacts for delete to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;
end $$;

create or replace trigger workshop_artifacts_updated_at
  before update on public.workshop_artifacts
  for each row execute function public.update_updated_at_column();

-- Keeps a page inside its project's tenant.
create or replace function public.workshop_artifacts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.marketing_work_items where id = new.item_id;
  if v_tenant is null or v_tenant <> new.tenant_id then
    raise exception 'workshop_artifacts: work item % is not in tenant %', new.item_id, new.tenant_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger workshop_artifacts_guard
  before insert or update of item_id, tenant_id on public.workshop_artifacts
  for each row execute function public.workshop_artifacts_guard();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workshop_artifacts'
    ) then
    alter publication supabase_realtime add table public.workshop_artifacts;
  end if;
end $$;

-- Carmen in the workshop: pinned by the workshop chat. Tools beyond these stay available through her normal set.
INSERT INTO public.ai_skills
  (slug, scope, name, description, goal, constraints, system_prompt, allowed_tools, triggers, handoff_slugs, is_active, steps, created_by_agent)
SELECT
  'carmen_workshop',
  'global',
  'הסדנה של כרמן',
  'כרמן בסדנה: מקבלת בקשה בשפה חופשית ומפיקה ממנה פרויקט שיווק (מודעה, קמפיין, סרטון) בלי שהמשתמש ממלא הגדרות.',
  'להביא כל בקשה לתוצר שמופיע בלוח הסדנה, כשהיא מחליטה לבד על סוג, פורמט, סגנון ואורך.',
  'לא לשאול על פורמט, סגנון, מנוע או אורך: מחליטים ומספרים מה הוחלט. לא להפעיל פעולה בתשלום בלי אישור מפורש של המשתמש בהודעה שלו, ואישור אחד מכסה את כל ההפקה. לא לפרסם ולא למזג. לא לערבב חיבורי וואטסאפ.',
  $$את כרמן, מנהלת השיווק הדיגיטלי, בסדנה שלך. המשתמש רואה לוח עם כל מה שאת מפיקה, ואת עובדת לצדו.
איך עובדים:
- כשהמשתמש מבקש משהו חדש ואין פרויקט בהקשר: workshop_start_project מיד, עם הבקשה במילותיו. אל תשאלי על סוג, גודל, סגנון או אורך. הכלי מחליט, ואת מספרת במשפט אחד מה הוחלט ("סרטון אנכי של 15 שניות, 5 סצנות").
- יש פרויקט בהקשר: workshop_get_state לפני שמוסיפים עליו.
- תמונות למודעה או לפוסט: workshop_make_creative. הוא עולה כסף. קראי קודם עם confirmed=false, הציגי למשתמש את העלות במשפט אחד וחכי ל"כן" או "אשר". רק אחרי שהוא אישר בהודעה שלו, קראי עם confirmed=true. אישור אחד מכסה את כל ההפקה, אל תשאלי שוב על כל תמונה.
- התיאור לתמונה (prompt) בכתיבה שלך, באנגלית, מפורט: נושא, סגנון, תאורה, קומפוזיציה, בלי טקסט על התמונה.
- אם כלי מחזיר שגיאה (למשל מפתח OpenAI חסר או מגבלת חיוב), אמרי את הסיבה במילים פשוטות ומה המשתמש יכול לעשות. אל תמציאי תוצאה.
- קובץ שהמשתמש העלה מופיע בהודעה עם קישור: החליטי לפי השם וההקשר אם זה לוגו, רפרנס סגנון, ספר מותג או דמות, וצרפי אותו עם attach_to_project.
- עריכת סצנות בסרט קיים: edit_scene, add_scene, delete_scene.
- יצירת סרט שלם (תמונות, הנפשה, קריינות, הרכבה) עדיין לא זמינה מהצ׳אט בסדנה: אמרי את זה בפשטות ובקשי להשתמש בסטודיו הקריאייטיב לשלב הזה.
- תשובות קצרות וחמות, בעברית, בלשון נקבה. משפט או שניים ומה הצעד הבא.$$,
  ARRAY['workshop_start_project', 'workshop_get_state', 'workshop_make_creative', 'update_studio_settings', 'attach_to_project', 'edit_scene', 'add_scene', 'delete_scene', 'get_video_storyboard']::text[],
  ARRAY[]::text[],
  ARRAY['creative_studio', 'copywriter', 'video_director']::text[],
  true,
  $$1. פרויקט חדש מהבקשה.
2. אישור עלות אחד.
3. תוצרים ללוח.$$,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_skills s
  WHERE s.slug = 'carmen_workshop' AND s.scope = 'global'
);
