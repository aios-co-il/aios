-- AIO-224: update_marketing_work_item (run-ai-agent) used to read the item, merge the payload
-- patch in memory and write the whole payload back, so a workshop write to
-- payload.workshop_budget or payload.workshop between the read and the write was lost.
-- This merges the patch in the UPDATE itself (payload || patch) and never takes those two
-- keys from the patch. Service role only. Safe to re-run.

create or replace function public.patch_marketing_work_item(
  p_item_id uuid,
  p_tenant_id uuid,
  p_title text default null,
  p_status text default null,
  p_payload_patch jsonb default null
)
returns table (id uuid, title text, status public.marketing_item_status)
language sql
security invoker
set search_path = public
as $$
  update public.marketing_work_items as item
     set title = coalesce(p_title, item.title),
         status = coalesce(p_status::public.marketing_item_status, item.status),
         payload = case
           when jsonb_typeof(p_payload_patch) = 'object'
             then coalesce(item.payload, '{}'::jsonb) || (p_payload_patch - 'workshop_budget' - 'workshop')
           else item.payload
         end,
         updated_at = now()
   where item.id = p_item_id
     and item.tenant_id = p_tenant_id
  returning item.id, item.title, item.status;
$$;

revoke all on function public.patch_marketing_work_item(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.patch_marketing_work_item(uuid, uuid, text, text, jsonb)
  to service_role;
