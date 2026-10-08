-- Read-only. Run on PROD in the SQL Editor and export the result as schema/prod-precheck-constraints.csv.
-- Lists duplicate groups that would block the new unique constraints and orphan rows that would block the new FKs.
-- Every row should show 0; anything else needs cleanup before the catch-up runs.
select 'uniq automation_shared_tenants' as check_name, count(*) as bad from (select 1 from automation_shared_tenants group by automation_id, tenant_id having count(*) > 1) d
union all select 'uniq carmen_memory_pointers', count(*) from (select 1 from carmen_memory_pointers group by tenant_id, path, entity_type, entity_id, subcategory having count(*) > 1) d
union all select 'uniq marketing_stage_templates', count(*) from (select 1 from marketing_stage_templates group by tenant_id, track, stage_type having count(*) > 1) d
union all select 'uniq social_comments', count(*) from (select 1 from social_comments group by platform, external_comment_id having count(*) > 1) d
union all select 'uniq social_pages', count(*) from (select 1 from social_pages group by tenant_id, platform, page_id having count(*) > 1) d
union all select 'uniq telegram_messages', count(*) from (select 1 from telegram_messages group by tenant_id, update_id having count(*) > 1) d
union all select 'uniq user_workspace_layout', count(*) from (select 1 from user_workspace_layout group by user_id, tenant_id, module_id having count(*) > 1) d
union all select 'uniq maskyoo_settings', count(*) from (select 1 from maskyoo_settings group by tenant_id having count(*) > 1) d
union all select 'uniq seo_call_snapshots', count(*) from (select 1 from seo_call_snapshots group by tenant_id, client_id, category, period_start, period_end having count(*) > 1) d
union all select 'uniq seo_monthly_updates', count(*) from (select 1 from seo_monthly_updates group by client_id, month having count(*) > 1) d
union all select 'uniq manually_read_contacts', count(*) from (select 1 from manually_read_contacts group by user_id, client_id having count(*) > 1) d
union all select 'fk agent_approval_queue.agent_id', count(*) from agent_approval_queue c where c.agent_id is not null and not exists (select 1 from ai_agents p where p.id = c.agent_id)
union all select 'fk agent_supervisors.child_agent_id', count(*) from agent_supervisors c where c.child_agent_id is not null and not exists (select 1 from ai_agents p where p.id = c.child_agent_id)
union all select 'fk agent_supervisors.supervisor_agent_id', count(*) from agent_supervisors c where c.supervisor_agent_id is not null and not exists (select 1 from ai_agents p where p.id = c.supervisor_agent_id)
union all select 'fk agent_tasks.agent_id', count(*) from agent_tasks c where c.agent_id is not null and not exists (select 1 from ai_agents p where p.id = c.agent_id)
union all select 'fk marketing_pipeline_stages.agent_id', count(*) from marketing_pipeline_stages c where c.agent_id is not null and not exists (select 1 from ai_agents p where p.id = c.agent_id)
union all select 'fk marketing_work_items.current_stage_id', count(*) from marketing_work_items c where c.current_stage_id is not null and not exists (select 1 from marketing_pipeline_stages p where p.id = c.current_stage_id)
union all select 'fk social_comments.page_id', count(*) from social_comments c where c.page_id is not null and not exists (select 1 from social_pages p where p.id = c.page_id);
