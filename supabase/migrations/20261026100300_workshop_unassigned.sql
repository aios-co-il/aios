-- Workshop projects without a client: a production needs a pipeline stage for its runs, so the
-- tenant gets one "no client" campaigns pipeline. Assigning the project to a client later moves
-- it to that client's creative stage. Files already made keep their storage path.

alter table public.marketing_pipelines alter column client_id drop not null;

comment on column public.marketing_pipelines.client_id is
  'NULL for the tenant''s single "no client" pipeline that holds workshop projects not yet assigned to a client.';

create unique index if not exists marketing_pipelines_tenant_general_track_idx
  on public.marketing_pipelines (tenant_id, track)
  where client_id is null;

-- The creative stage of a client's campaigns pipeline (or of the "no client" pipeline when
-- p_client_id is null). Creates the pipeline with its default stages when missing.
create or replace function public.workshop_creative_stage(
  p_tenant_id uuid,
  p_client_id uuid default null
)
returns table (pipeline_id uuid, stage_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pipeline uuid;
  v_stage uuid;
begin
  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and tenant_id = p_tenant_id
  ) then
    raise exception 'workshop_creative_stage: client % is not in tenant %', p_client_id, p_tenant_id
      using errcode = '42501';
  end if;

  select p.id into v_pipeline
    from public.marketing_pipelines p
   where p.tenant_id = p_tenant_id
     and p.track = 'campaigns'
     and p.client_id is not distinct from p_client_id
   order by p.created_at
   limit 1;

  if v_pipeline is null then
    begin
      insert into public.marketing_pipelines (tenant_id, client_id, track, name)
      values (
        p_tenant_id,
        p_client_id,
        'campaigns',
        case when p_client_id is null then 'ללא לקוח' else 'מחלקת שיווק' end
      )
      returning id into v_pipeline;
    exception when unique_violation then
      select p.id into v_pipeline
        from public.marketing_pipelines p
       where p.tenant_id = p_tenant_id
         and p.track = 'campaigns'
         and p.client_id is not distinct from p_client_id
       limit 1;
    end;
  end if;

  if not exists (
    select 1 from public.marketing_pipeline_stages s where s.pipeline_id = v_pipeline
  ) then
    insert into public.marketing_pipeline_stages
      (pipeline_id, tenant_id, stage_type, name, sort_order, position_x, position_y, approval_mode, configuration)
    select v_pipeline, p_tenant_id, d.stage_type, d.name, d.sort_order,
           (5 - d.sort_order) * 280 - 280, 200, 'manual', '{}'::jsonb
      from (values
        ('strategy', 'בריף', 0),
        ('copy', 'כתיבת תוכן', 1),
        ('creative', 'קריאייטיב', 2),
        ('target_paid', 'קמפיין ממומן', 3),
        ('measurement', 'מדידה', 4)
      ) as d(stage_type, name, sort_order);
  end if;

  select s.id into v_stage
    from public.marketing_pipeline_stages s
   where s.pipeline_id = v_pipeline and s.stage_type = 'creative'
   limit 1;
  if v_stage is null then
    raise exception 'workshop_creative_stage: pipeline % has no creative stage', v_pipeline
      using errcode = 'P0002';
  end if;

  return query select v_pipeline, v_stage;
end;
$$;

grant execute on function public.workshop_creative_stage(uuid, uuid) to authenticated, service_role;

-- Assigns a project to a client, or back to "no client" when p_client_id is null.
create or replace function public.workshop_assign_client(
  p_item_id uuid,
  p_client_id uuid default null
)
returns public.marketing_work_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_pipeline uuid;
  v_stage uuid;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'workshop_assign_client: work item % not found', p_item_id using errcode = 'P0002';
  end if;

  if p_client_id is null then
    update public.marketing_work_items
       set client_id = null, pipeline_id = null, current_stage_id = null
     where id = p_item_id
    returning * into v_item;
    return v_item;
  end if;

  select s.pipeline_id, s.stage_id into v_pipeline, v_stage
    from public.workshop_creative_stage(v_item.tenant_id, p_client_id) s;

  update public.marketing_work_items
     set client_id = p_client_id, pipeline_id = v_pipeline, current_stage_id = v_stage
   where id = p_item_id
  returning * into v_item;
  return v_item;
end;
$$;

grant execute on function public.workshop_assign_client(uuid, uuid) to authenticated, service_role;

-- Carmen workshop skin: client is optional for production and can be assigned later.
UPDATE public.ai_skills
SET
  system_prompt = $$את כרמן, מנהלת השיווק הדיגיטלי, בסדנה שלך. המשתמש רואה לוח עם כל מה שאת מפיקה, ואת עובדת לצדו.
איך עובדים:
- כשהמשתמש מבקש משהו חדש ואין פרויקט בהקשר: workshop_start_project מיד, עם הבקשה במילותיו. אל תשאלי על סוג, גודל, סגנון, אורך או לקוח. הכלי מחליט, ואת מספרת במשפט אחד מה הוחלט ("סרטון אנכי של 15 שניות, 5 סצנות").
- לקוח לא נדרש. פרויקט יכול להיות בלי לקוח, וההפקה עובדת גם כך. אם המשתמש מציין לקוח, שייכי אותו: בפתיחה עם client_id, או אחר כך עם workshop_assign_client. אל תשאלי "לאיזה לקוח" ואל תעצרי בגלל זה.
- יש פרויקט בהקשר: workshop_get_state לפני שמוסיפים עליו.
- קונספטים: מציעים שלושה כיוונים שונים עם workshop_save_concepts. קופי (כותרות, טקסט, קריאה לפעולה): workshop_save_copy. כל אחד נשמר ללוח, ואין בהם עלות.
- תמונות למודעה או לפוסט: workshop_make_creative. הוא עולה כסף. קראי קודם עם confirmed=false, הציגי למשתמש את העלות במשפט אחד וחכי ל"כן" או "אשר". רק אחרי שהוא אישר בהודעה שלו, קראי עם confirmed=true. אישור אחד מכסה את כל ההפקה, אל תשאלי שוב על כל תמונה.
- התיאור לתמונה (prompt) בכתיבה שלך, באנגלית, מפורט: נושא, סגנון, תאורה, קומפוזיציה, בלי טקסט על התמונה.
- סרטון: קודם workshop_storyboard (כתיבת הסצנות, בלי עלות), אחר כך workshop_make_stills (תמונה לכל סצנה, עולה כסף ודורש אישור), ואז workshop_produce_video (הנפשה, קריינות, מוזיקה והרכבה). בכל כלי כזה קראי קודם עם confirmed=false, הציגי את העלות ואת המנוע שנבחר במשפט אחד, וחכי לאישור. אישור אחד מכסה את ההפקה כולה.
- ההפקה רצה ברקע. אחרי workshop_produce_video אמרי שהסרט יופיע בלוח בעוד דקה או שתיים, ואל תחכי ואל תבדקי בלולאה.
- אם כלי מחזיר שגיאה (למשל מפתח OpenAI חסר או מגבלת חיוב), אמרי את הסיבה במילים פשוטות ומה המשתמש יכול לעשות. אל תמציאי תוצאה.
- אם אין מפתחות למנוע וידאו, ההפקה תרוץ במנוע בדיקה: אמרי את זה בפשטות.
- קובץ שהמשתמש העלה מופיע בהודעה עם קישור: החליטי לפי השם וההקשר אם זה לוגו, רפרנס סגנון, ספר מותג או דמות, וצרפי אותו עם attach_to_project.
- עריכת סצנות בסרט קיים: edit_scene, add_scene, delete_scene.
- תשובות קצרות וחמות, בעברית, בלשון נקבה. משפט או שניים ומה הצעד הבא.$$,
  allowed_tools = ARRAY[
    'workshop_start_project', 'workshop_get_state', 'workshop_make_creative',
    'workshop_save_concepts', 'workshop_save_copy', 'workshop_storyboard',
    'workshop_make_stills', 'workshop_produce_video', 'workshop_assign_client',
    'update_studio_settings', 'attach_to_project', 'edit_scene', 'add_scene', 'delete_scene',
    'get_video_storyboard'
  ]::text[]
WHERE slug = 'carmen_workshop' AND scope = 'global';
