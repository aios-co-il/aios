-- AIO-595: the recordings bucket was public, and its policies checked only the
-- bucket, so any signed-in user of any tenant could read, upload and delete
-- every file. Make it private and key every policy on the tenant folder.
update storage.buckets set public = false where id = 'recordings';

drop policy if exists "Authenticated users can view recordings" on storage.objects;
drop policy if exists "Authenticated users can upload recordings" on storage.objects;
drop policy if exists "Authenticated users can delete own recordings" on storage.objects;

-- Reads: members of the tenant whose folder holds the file. The tenant folder
-- is the first segment, or the second under summaries/ (written by the
-- service role). Super admins read every tenant, as in call-recordings.
drop policy if exists "Tenant members read recordings" on storage.objects;
create policy "Tenant members read recordings" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and (
      public.is_super_admin(auth.uid())
      or exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id::text = case
            when (storage.foldername(name))[1] = 'summaries'
              then (storage.foldername(name))[2]
            else (storage.foldername(name))[1]
          end
      )
    )
  );

-- Uploads: only into a tenant folder the user belongs to.
drop policy if exists "Tenant members upload recordings" on storage.objects;
create policy "Tenant members upload recordings" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id::text = (storage.foldername(name))[1]
    )
  );

-- Deletes: only files in a tenant folder the user belongs to.
drop policy if exists "Tenant members delete recordings" on storage.objects;
create policy "Tenant members delete recordings" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings'
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id::text = (storage.foldername(name))[1]
    )
  );
