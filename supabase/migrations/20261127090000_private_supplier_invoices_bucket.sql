-- AIO-608: the supplier-invoices bucket was public, so anyone who knew a file's
-- path could download it without signing in, and its policies checked only the
-- bucket, so any signed-in user of any tenant could read, upload and delete
-- every file. Invoice rows also kept a link signed for ten years. Make the
-- bucket private, give files the same rules as supplier_invoices rows, and
-- keep the file's path on the row so the app signs a short link when a file
-- is opened.
alter table public.supplier_invoices add column if not exists file_path text;

comment on column public.supplier_invoices.file_path is
  'Path of the invoice file in the supplier-invoices bucket. The app signs a short link from it; file_url is the older stored link.';

-- Percent-decodes a URL path (%20 to a space, and so on), byte by byte. Null
-- when the bytes are not valid text, so one odd link cannot fail the migration.
create function pg_temp.url_decode(p_encoded text)
returns text
language plpgsql
immutable
as $fn$
begin
  return (
    select convert_from(
      string_agg(
        case
          when length(piece.token[1]) = 3 then decode(substring(piece.token[1] from 2), 'hex')
          else convert_to(piece.token[1], 'UTF8')
        end,
        ''::bytea
        order by piece.position
      ),
      'UTF8'
    )
    from regexp_matches(p_encoded, '(%[0-9A-Fa-f]{2}|.)', 'g')
      with ordinality as piece(token, position)
  );
exception when others then
  return null;
end;
$fn$;

-- Rows written before this column: the path is the tail of the stored link,
-- public or signed, without its query string.
update public.supplier_invoices
set file_path = pg_temp.url_decode(
  split_part(
    substring(file_url from '/storage/v1/object/(?:public|sign)/supplier-invoices/(.+)$'),
    '?',
    1
  )
)
where file_path is null
  and file_url ~ '/storage/v1/object/(public|sign)/supplier-invoices/.+';

-- The stored links are no longer read once a row has its path. Dropping them
-- takes the ten-year links out of the database; a copy someone already holds
-- stays valid until its file is removed.
update public.supplier_invoices
set file_url = null
where file_path is not null and file_url is not null;

update storage.buckets set public = false where id = 'supplier-invoices';

drop policy if exists "Anyone can view supplier invoices" on storage.objects;
drop policy if exists "Authenticated users can view supplier invoices" on storage.objects;
drop policy if exists "Authenticated users can upload supplier invoices" on storage.objects;
drop policy if exists "Authenticated users can delete supplier invoices" on storage.objects;

-- Reads: finance readers of the tenant whose folder holds the file; super
-- admins read every tenant, as in supplier_invoices_finance_select.
drop policy if exists "Finance readers read supplier invoice files" on storage.objects;
create policy "Finance readers read supplier invoice files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and (
      (
        (storage.foldername(name))[1] = public.get_user_tenant_id((select auth.uid()))::text
        and public.has_finance_permission((select auth.uid()))
      )
      or public.is_super_admin((select auth.uid()))
    )
  );

-- Uploads: finance writers, only into the folder of the tenant they act in.
drop policy if exists "Finance writers upload supplier invoice files" on storage.objects;
create policy "Finance writers upload supplier invoice files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplier-invoices'
    and (storage.foldername(name))[1] = public.get_user_tenant_id((select auth.uid()))::text
    and public.has_finance_write_permission((select auth.uid()))
  );

-- Deletes: finance writers, only files of the tenant they act in.
drop policy if exists "Finance writers delete supplier invoice files" on storage.objects;
create policy "Finance writers delete supplier invoice files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and (storage.foldername(name))[1] = public.get_user_tenant_id((select auth.uid()))::text
    and public.has_finance_write_permission((select auth.uid()))
  );
