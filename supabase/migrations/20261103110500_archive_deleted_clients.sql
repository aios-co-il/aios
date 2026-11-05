-- Archive every deleted client, with the rows its delete cascades to, in
-- archive.orphan_rows (AIO-67). 20261103110000_restore_lost_constraints makes
-- communication_logs_client_id_fkey and seo_monthly_updates_client_id_fkey
-- ON DELETE CASCADE again; David decided the cascade stays, but a client
-- delete (normally a duplicate; real clients are paused, not deleted) must
-- not lose data. A BEFORE DELETE row trigger runs before the foreign keys'
-- cascade, so the client row and its logs and SEO updates are still there to
-- copy. It also fires when a tenant delete cascades to its clients, so another
-- tenant's logs on those clients (shared agency) are archived too.
--
-- reason 'client_deleted' keys the archive with (source_table, row_id); if
-- the same row is archived again (a re-created id deleted a second time), the
-- newer copy replaces the older one.

-- Copy the client being deleted and its cascading communication logs and SEO
-- monthly updates into archive.orphan_rows, then let the delete go on.
create or replace function public.archive_deleted_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    insert into archive.orphan_rows (source_table, row_id, row, reason)
    select 'clients', old.id, to_jsonb(old), 'client_deleted'
    union all
    select 'communication_logs', l.id, to_jsonb(l), 'client_deleted'
    from public.communication_logs as l
    where l.client_id = old.id
    union all
    select 'seo_monthly_updates', s.id, to_jsonb(s), 'client_deleted'
    from public.seo_monthly_updates as s
    where s.client_id = old.id
    on conflict (source_table, row_id, reason)
      do update set "row" = excluded."row", archived_at = now();
  end if;
  return old;
end;
$$;

revoke all on function public.archive_deleted_client() from public, anon, authenticated;

drop trigger if exists clients_archive_before_delete on public.clients;
create trigger clients_archive_before_delete
  before delete on public.clients
  for each row execute function public.archive_deleted_client();

comment on table archive.orphan_rows is
  'Rows a migration deleted or changed, as they were before. 20261103110000_restore_lost_constraints: rows whose client was deleted. 20261103110500_archive_deleted_clients (reason client_deleted): every deleted client, with its communication_logs and seo_monthly_updates rows, copied before the delete cascades.';
