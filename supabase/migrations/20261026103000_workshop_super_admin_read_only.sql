-- A super admin may read another tenant's workshop pages and assets, never change them
-- (docs/TENANT_ISOLATION.md). Writes are limited to members of the row's own tenant.

do $$
declare
  v_table text;
  v_member text := 'tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid()))';
begin
  foreach v_table in array array['workshop_artifacts', 'workshop_assets'] loop
    execute format('drop policy if exists %I on public.%I', v_table || '_insert', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_update', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_delete', v_table);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', v_table || '_insert', v_table, v_member);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', v_table || '_update', v_table, v_member, v_member);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', v_table || '_delete', v_table, v_member);
  end loop;
end $$;
