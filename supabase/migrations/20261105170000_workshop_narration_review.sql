-- The workshop's narration review (semi-automatic mode): Carmen voices the narration alone, the
-- user listens on the board and approves it or corrects how words are said, before any clip is
-- paid for. Safe to re-run.
--
-- workshop_pronunciations: how a word is said in this tenant's films, for every project of the
--   workshop (David, 5 Nov: "כרמן" is said the same in every future film). The render worker
--   (service role) puts `spoken` in place of `word` in the text the voice engine hears, ahead of
--   the automatic nikud; Carmen writes them with workshop_save_pronunciation (service role).
-- workshop_narration_take: what the edge's narration review needs to know about a project's
--   narration in one read: the newest continuous take, whether it reads the current script in the
--   project's voice, whether a pronunciation changed since it was made, and the latest voice run.

-- ── 1. workshop_pronunciations ──────────────────────────────────────────────
create table if not exists public.workshop_pronunciations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- The word as the script writes it, without nikud or punctuation.
  word text not null check (char_length(word) between 1 and 40),
  -- One word as the voice should hear it: with nikud, or respelled.
  spoken text not null check (char_length(spoken) between 1 and 60),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workshop_pronunciations_tenant_word_key unique (tenant_id, word)
);

alter table public.workshop_pronunciations enable row level security;

grant select, insert, update, delete on public.workshop_pronunciations to authenticated, service_role;

do $$
begin
  -- Members of the tenant (and super admins) read its pronunciations.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_pronunciations' and policyname = 'workshop_pronunciations_select') then
    create policy workshop_pronunciations_select on public.workshop_pronunciations for select to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));
  end if;

  -- Members add pronunciations only to their own tenant.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_pronunciations' and policyname = 'workshop_pronunciations_insert') then
    create policy workshop_pronunciations_insert on public.workshop_pronunciations for insert to authenticated
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;

  -- Members change pronunciations only inside their own tenant.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_pronunciations' and policyname = 'workshop_pronunciations_update') then
    create policy workshop_pronunciations_update on public.workshop_pronunciations for update to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())))
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;

  -- Members remove pronunciations only from their own tenant.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workshop_pronunciations' and policyname = 'workshop_pronunciations_delete') then
    create policy workshop_pronunciations_delete on public.workshop_pronunciations for delete to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())));
  end if;
end $$;

create or replace trigger workshop_pronunciations_updated_at
  before update on public.workshop_pronunciations
  for each row execute function public.update_updated_at_column();

-- ── 2. workshop_narration_take ──────────────────────────────────────────────
-- The project's narration as the review sees it, or null for an unknown project: ready
-- (video_narration_ready), talking (video_film_talks), the newest continuous take (its run and
-- asset), whether a tenant pronunciation changed since that take (a newer entry for a word in its
-- script, or an entry it used that changed or is gone), and the newest continuous voice run.
-- Runs as the caller, so the caller's RLS decides what exists.
create or replace function public.workshop_narration_take(p_item_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with item as (
    select work.id, work.tenant_id
      from public.marketing_work_items as work
     where work.id = p_item_id
  ),
  take as (
    select asset.id, asset.run_id, asset.created_at,
           -- The script it read, without nikud, as the pronunciations' words are stored.
           regexp_replace(coalesce(asset.meta->>'text', ''),
             '[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]', '', 'g') as script,
           case when jsonb_typeof(asset.meta->'pronunciations') = 'object'
             then asset.meta->'pronunciations' else '{}'::jsonb end as used
      from public.marketing_assets as asset
      join item on item.id = asset.item_id and item.tenant_id = asset.tenant_id
     where asset.type = 'narration' and asset.url is not null
     order by asset.created_at desc
     limit 1
  ),
  last_run as (
    select run.id, run.status, run.error
      from public.marketing_runs as run
      join item on item.id = run.item_id and item.tenant_id = run.tenant_id
     where run.kind = 'voice' and run.scene_id is null
     order by run.created_at desc
     limit 1
  )
  select jsonb_build_object(
    'ready', public.video_narration_ready(item.id),
    'talking', public.video_film_talks(item.id),
    'run_id', (select take.run_id from take),
    'asset_id', (select take.id from take),
    'pronunciations_changed', coalesce((
      select exists (
               select 1 from public.workshop_pronunciations as entry
                where entry.tenant_id = item.tenant_id
                  and (
                    (entry.updated_at > take.created_at and strpos(take.script, entry.word) > 0)
                    or (take.used ? entry.word and take.used->>entry.word <> entry.spoken)
                  )
             )
             or exists (
               select 1 from jsonb_object_keys(take.used) as used_word
                where not exists (
                  select 1 from public.workshop_pronunciations as entry
                   where entry.tenant_id = item.tenant_id and entry.word = used_word
                )
             )
        from take
    ), false),
    'last_run_id', (select last_run.id from last_run),
    'last_run_status', (select last_run.status from last_run),
    'last_run_error', (select last_run.error from last_run)
  )
  from item;
$$;

revoke all on function public.workshop_narration_take(uuid) from public, anon;
grant execute on function public.workshop_narration_take(uuid) to authenticated, service_role;

-- ── 3. Carmen's guidance ────────────────────────────────────────────────────
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- בדיקת קריינות (מצב חצי אוטומטי): אחרי שהקול נבחר, workshop_produce_video מקליט קודם רק את הקריינות (עולה סנטים, מתוך התקציב של הסרט), היא מופיעה בלוח בעמוד "קריינות", והמשתמש מאשר בכפתור "הקריינות מאושרת" לפני שמשהו מונפש. אין הפקה עד שאישר את הקריינות שהוצגה לו. ההקלטה שאושרה היא זו שנכנסת לסרט, בלי לשלם עליה שוב.'
    || E'\n  • המשתמש אומר שמילה נשמעת לא נכון (״מכירות נשמע מחירות״): שמרי את ההגייה ב-workshop_save_pronunciation: word כפי שכתובה בתסריט, spoken מילה אחת בניקוד מלא (מְכִירוֹת) או בכתיב שנשמע נכון. ההגייה נשמרת לכל הסדנה ולכל הסרטים הבאים: אמרי למשתמש שזה ייזכר בכל הפרויקטים. אחר כך קראי שוב ל-workshop_produce_video: הקריינות מוקלטת מחדש ומוצגת שוב לאישור.'
    || E'\n  • ביקש הקלטה חדשה בלי מילה מסוימת (נשמע לא טבעי): workshop_produce_video עם redo_narration=true. ביקש קול אחר: workshop_choose_voice. ביקש לשנות טקסט: תקני את הסצנה (workshop_update_scene); הקריינות תוקלט מחדש.'
    || E'\n  • מצב אוטומטי: אין שלב בדיקה; ההגיות השמורות חלות גם שם.'
WHERE slug IN ('carmen_workshop', 'workshop_producer')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%בדיקת קריינות (מצב חצי אוטומטי)%';
