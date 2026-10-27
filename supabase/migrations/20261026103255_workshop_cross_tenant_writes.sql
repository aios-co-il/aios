-- PR 932 review: no workshop write crosses tenants (TENANT_ISOLATION.md). Safe to re-run.
--
-- #25 workshop_fail_pending_film is security definer and found the pending film page by the
--     run's item_id alone. marketing_runs does not tie item_id to tenant_id, so a member of one
--     tenant could fail a render run naming another tenant's project and write their own text
--     into that tenant's film page (which Carmen quotes). It now reads the run's own tenant
--     only, as workshop_mirror_asset (20261026101800) and
--     workshop_fail_pending_films_on_production (20261026102500) already do.
--
-- Replaces (copied from the latest definition, the change marked "same tenant"):
--   workshop_fail_pending_film   (20261026100200_workshop_video.sql)

-- ── #25 A failed render closes the pending film page of its own tenant only ─────
create or replace function public.workshop_fail_pending_film()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'render' and new.status = 'failed' and old.status is distinct from 'failed' then
    update public.workshop_artifacts
       set status = 'failed',
           meta = meta || jsonb_build_object('error', coalesce(new.error, 'ההרכבה נכשלה'))
     where id = (
       select id from public.workshop_artifacts
        where item_id = new.item_id
          and tenant_id = new.tenant_id -- same tenant
          and kind = 'film'
          and status = 'pending'
        order by created_at desc
        limit 1
     );
  end if;
  return new;
exception when others then
  raise warning 'workshop_fail_pending_film: %', sqlerrm;
  return new;
end;
$$;
