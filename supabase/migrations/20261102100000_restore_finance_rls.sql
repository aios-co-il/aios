-- Finance access rules: restore the row-level security policies the
-- Production baseline (20261009000000) lost on the finance tables, and hold
-- client_tenant_financial_data and finance to the same rule.
--
-- expense_payments, income_payments, one_time_incomes, invoice_uploads and
-- supplier_invoices have RLS on and no policies in Production and Staging. A
-- signed-in user reads no rows there, and every insert fails with 42501 (cash
-- flow, invoice intake, supplier invoices). payment_links keeps no policies:
-- only create-sumit-payment uses it, with the service role.
--
-- The rule (David): financial data is for the tenant owner, a super admin, or
-- a user granted the finance permission. The permissions are read the way the
-- app reads them (useUserPermissions, src/lib/modules.ts): user_permissions
-- rows by module with can_access. finance_view is view only, so it may read;
-- the full finance permission may read and write.
--
-- Changes against the policies these tables had before the baseline:
-- - The five restored tables were open to every member of the tenant. They
--   now follow the rule above.
-- - client_tenant_financial_data (retainer and budget per client) was open to
--   every member, TO public. It now follows the same rule, TO authenticated.
-- - finance keeps its read policy; has_finance_permission now also accepts
--   the full finance permission, so a user granted it sees the Finance page's
--   rows. Writes to finance now need the full permission, not finance_view.
-- - suppliers and client_suppliers are unchanged.
-- - anon can no longer execute has_finance_permission. Only policies TO
--   authenticated call it, and no client calls it as an RPC.
--
-- No data changes.

-- Who may write the tenant's financial data: the owner of the active tenant, a super admin, or a holder of the finance permission.
create or replace function public.has_finance_write_permission(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_role(_user_id, 'owner'::public.app_role)
    or public.is_super_admin(_user_id)
    or exists (
      select 1
      from public.user_permissions
      where user_id = _user_id
        and module = 'finance'
        and can_access
    )
$$;

revoke all on function public.has_finance_write_permission(uuid) from public, anon, authenticated;
grant execute on function public.has_finance_write_permission(uuid) to authenticated, service_role;

-- Who may read the tenant's financial data: anyone who may write it, or a holder of finance_view.
create or replace function public.has_finance_permission(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_finance_write_permission(_user_id)
    or exists (
      select 1
      from public.user_permissions
      where user_id = _user_id
        and module = 'finance_view'
        and can_access
    )
$$;

revoke all on function public.has_finance_permission(uuid) from public, anon, authenticated;
grant execute on function public.has_finance_permission(uuid) to authenticated, service_role;

-- expense_payments: select, insert and delete. Nothing updates a payment, as before the baseline.

-- Finance readers see their tenant's expense payments; super admins see every tenant's.
drop policy if exists expense_payments_finance_select on public.expense_payments;
create policy expense_payments_finance_select on public.expense_payments
  for select to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers record expense payments in their tenant; super admins in any.
drop policy if exists expense_payments_finance_insert on public.expense_payments;
create policy expense_payments_finance_insert on public.expense_payments
  for insert to authenticated
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers remove their tenant's expense payments; super admins any.
drop policy if exists expense_payments_finance_delete on public.expense_payments;
create policy expense_payments_finance_delete on public.expense_payments
  for delete to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- income_payments: select, insert and delete. Nothing updates a payment, as before the baseline.

-- Finance readers see their tenant's income payments; super admins see every tenant's.
drop policy if exists income_payments_finance_select on public.income_payments;
create policy income_payments_finance_select on public.income_payments
  for select to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers record income payments in their tenant; super admins in any.
drop policy if exists income_payments_finance_insert on public.income_payments;
create policy income_payments_finance_insert on public.income_payments
  for insert to authenticated
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers remove their tenant's income payments; super admins any.
drop policy if exists income_payments_finance_delete on public.income_payments;
create policy income_payments_finance_delete on public.income_payments
  for delete to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- one_time_incomes

-- Finance readers see their tenant's one-time incomes; super admins see every tenant's.
drop policy if exists one_time_incomes_finance_select on public.one_time_incomes;
create policy one_time_incomes_finance_select on public.one_time_incomes
  for select to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers add one-time incomes to their tenant; super admins to any.
drop policy if exists one_time_incomes_finance_insert on public.one_time_incomes;
create policy one_time_incomes_finance_insert on public.one_time_incomes
  for insert to authenticated
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers edit their tenant's one-time incomes and cannot move them to another tenant; super admins edit any.
drop policy if exists one_time_incomes_finance_update on public.one_time_incomes;
create policy one_time_incomes_finance_update on public.one_time_incomes
  for update to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers remove their tenant's one-time incomes; super admins any.
drop policy if exists one_time_incomes_finance_delete on public.one_time_incomes;
create policy one_time_incomes_finance_delete on public.one_time_incomes
  for delete to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- invoice_uploads

-- Finance readers see their tenant's uploaded invoices; super admins see every tenant's.
drop policy if exists invoice_uploads_finance_select on public.invoice_uploads;
create policy invoice_uploads_finance_select on public.invoice_uploads
  for select to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers upload invoices to their tenant; super admins to any.
drop policy if exists invoice_uploads_finance_insert on public.invoice_uploads;
create policy invoice_uploads_finance_insert on public.invoice_uploads
  for insert to authenticated
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers edit their tenant's uploaded invoices and cannot move them to another tenant; super admins edit any.
drop policy if exists invoice_uploads_finance_update on public.invoice_uploads;
create policy invoice_uploads_finance_update on public.invoice_uploads
  for update to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers remove their tenant's uploaded invoices; super admins any.
drop policy if exists invoice_uploads_finance_delete on public.invoice_uploads;
create policy invoice_uploads_finance_delete on public.invoice_uploads
  for delete to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- supplier_invoices

-- Finance readers see their tenant's supplier invoices; super admins see every tenant's.
drop policy if exists supplier_invoices_finance_select on public.supplier_invoices;
create policy supplier_invoices_finance_select on public.supplier_invoices
  for select to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers add supplier invoices to their tenant; super admins to any.
drop policy if exists supplier_invoices_finance_insert on public.supplier_invoices;
create policy supplier_invoices_finance_insert on public.supplier_invoices
  for insert to authenticated
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers edit their tenant's supplier invoices and cannot move them to another tenant; super admins edit any.
drop policy if exists supplier_invoices_finance_update on public.supplier_invoices;
create policy supplier_invoices_finance_update on public.supplier_invoices
  for update to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers remove their tenant's supplier invoices; super admins any.
drop policy if exists supplier_invoices_finance_delete on public.supplier_invoices;
create policy supplier_invoices_finance_delete on public.supplier_invoices
  for delete to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- client_tenant_financial_data: replace the four tenant-wide TO public policies.
drop policy if exists "Users can view financial data in their tenant" on public.client_tenant_financial_data;
drop policy if exists "Users can insert financial data in their tenant" on public.client_tenant_financial_data;
drop policy if exists "Users can update financial data in their tenant" on public.client_tenant_financial_data;
drop policy if exists "Users can delete financial data in their tenant" on public.client_tenant_financial_data;

-- Finance readers see their tenant's client retainers and budgets; super admins see every tenant's.
drop policy if exists client_tenant_financial_data_finance_select on public.client_tenant_financial_data;
create policy client_tenant_financial_data_finance_select on public.client_tenant_financial_data
  for select to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers set client retainers and budgets in their tenant; super admins in any.
drop policy if exists client_tenant_financial_data_finance_insert on public.client_tenant_financial_data;
create policy client_tenant_financial_data_finance_insert on public.client_tenant_financial_data
  for insert to authenticated
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers edit their tenant's client retainers and budgets and cannot move them to another tenant; super admins edit any.
drop policy if exists client_tenant_financial_data_finance_update on public.client_tenant_financial_data;
create policy client_tenant_financial_data_finance_update on public.client_tenant_financial_data
  for update to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers remove their tenant's client retainers and budgets; super admins any.
drop policy if exists client_tenant_financial_data_finance_delete on public.client_tenant_financial_data;
create policy client_tenant_financial_data_finance_delete on public.client_tenant_financial_data
  for delete to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- finance: the read policy stays as it is; writes move from has_finance_permission to the write rule.

-- Finance writers record their tenant's income and expenses; super admins in any tenant.
drop policy if exists "Users with finance permission can insert finance" on public.finance;
create policy "Users with finance permission can insert finance" on public.finance
  for insert to authenticated
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers edit their tenant's income and expenses and cannot move them to another tenant; super admins edit any.
drop policy if exists "Users with finance permission can update finance" on public.finance;
create policy "Users with finance permission can update finance" on public.finance
  for update to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Finance writers remove their tenant's income and expenses; super admins any.
drop policy if exists "Users with finance permission can delete finance" on public.finance;
create policy "Users with finance permission can delete finance" on public.finance
  for delete to authenticated
  using (
    (tenant_id = public.get_user_tenant_id((select auth.uid()))
      and public.has_finance_write_permission((select auth.uid())))
    or public.is_super_admin((select auth.uid()))
  );

-- Guard: every finance table the app reads has policies, and none of them reaches anon.
do $$
declare
  v_tables text[] := array[
    'expense_payments', 'income_payments', 'one_time_incomes', 'invoice_uploads',
    'supplier_invoices', 'client_tenant_financial_data', 'finance'
  ];
  v_bare text;
  v_wide text;
begin
  select string_agg(t, ', ') into v_bare
  from unnest(v_tables) as t
  where not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
  );
  if v_bare is not null then
    raise exception 'restore_finance_rls: no policies on %', v_bare;
  end if;

  select string_agg(distinct p.tablename, ', ') into v_wide
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = any (v_tables)
    and p.roles <> array['authenticated']::name[];
  if v_wide is not null then
    raise exception 'restore_finance_rls: a policy reaches more than authenticated on %', v_wide;
  end if;
end;
$$;
