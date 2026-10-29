-- Telephony, Telegram and ManyChat access rules: restore the row-level
-- security policies the Production baseline (20261009000000) lost on
-- telephony_settings, telegram_bot_state, telegram_messages and sync_jobs.
--
-- The four tables have RLS on and no policies in Production and Staging. A
-- signed-in user reads no rows there, so the Telephony, Telegram and ManyChat
-- settings pages and the Telegram chats show nothing, and every save fails
-- with 42501. Edge functions use the service role and are unaffected.
--
-- No table here holds a secret (checked on Staging): the Telegram bot token is
-- the TELEGRAM_BOT_TOKEN function secret, telephony credentials live in
-- tenant_integrations and maskyoo_settings, and sync_jobs.settings holds only
-- the ManyChat tag id and delay. So the policies cover whole rows.
--
-- A super admin reads every tenant and writes only as the tenant they act in
-- (TENANT_ISOLATION.md): no write policy has a super-admin branch.
--
-- Changes against the policies these tables had before the baseline:
-- - Every policy is TO authenticated; sync_jobs' were TO public.
-- - Super admins no longer write telegram_bot_state or telegram_messages in
--   other tenants.
-- - telegram_bot_state sharing: the insert and delete rules compared
--   shared_from_state_id with itself, so sharing a bot never matched. They now
--   check the source bot's tenant, through telegram_bot_state_source_tenant so
--   no policy queries its own table. A shared copy is also readable by members
--   of the tenant it lives in, so the source tenant's sharing panel can list
--   and remove its copies. Any member of both tenants may share, as before.
-- - telegram_messages: read in the active tenant only, not in every tenant the
--   user belongs to.
-- - sync_jobs: read only. start-sync-job, run-sync-job and stop-sync-job write
--   with the service role.
-- - telephony_settings keeps its tenant-wide read: colleagues see each other's
--   personal and virtual numbers, as before.
--
-- telegram-verify-bot upserts the tenant's bot. Its conflict target was
-- (tenant_id), which only a partial unique index covered, so every connect
-- failed with 42P10. One unique index on (tenant_id, shared_from_state_id)
-- with NULLS NOT DISTINCT replaces the two partial ones. It enforces the same
-- rule (one own bot per tenant, one copy per source bot per tenant), so rows
-- that met the old indexes meet it, and the function names it. The function
-- now writes as the caller, so the owner policies below decide the write.
--
-- No data changes.

-- One own bot per tenant (shared_from_state_id null) and one copy per source bot per tenant.
create unique index if not exists telegram_bot_state_tenant_source_unique
  on public.telegram_bot_state (tenant_id, shared_from_state_id) nulls not distinct;

drop index if exists public.telegram_bot_state_tenant_primary_unique;
drop index if exists public.telegram_bot_state_tenant_shared_unique;

-- The tenant of bot row _state_id when the caller belongs to it, else null; read past RLS so the
-- sharing policies need not query telegram_bot_state themselves.
create or replace function public.telegram_bot_state_source_tenant(_state_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.tenant_id
  from public.telegram_bot_state as s
  where s.id = _state_id
    and public.user_is_tenant_member(s.tenant_id)
$$;

revoke all on function public.telegram_bot_state_source_tenant(uuid) from public, anon, authenticated;
grant execute on function public.telegram_bot_state_source_tenant(uuid) to authenticated, service_role;

-- telephony_settings: one row per user per tenant (numbers and recording preference).

-- Members read their tenant's telephony settings; super admins read every tenant's.
drop policy if exists telephony_settings_select on public.telephony_settings;
create policy telephony_settings_select on public.telephony_settings
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- A user creates only their own settings, in their active tenant.
drop policy if exists telephony_settings_insert on public.telephony_settings;
create policy telephony_settings_insert on public.telephony_settings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- A user edits only their own settings, and keeps them theirs and in their active tenant.
drop policy if exists telephony_settings_update on public.telephony_settings;
create policy telephony_settings_update on public.telephony_settings
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- telegram_bot_state: the tenant's bot (shared_from_state_id null) or a copy shared from another tenant's bot.

drop policy if exists telegram_bot_state_owner_all on public.telegram_bot_state;

-- Members read their active tenant's bot rows; super admins read every tenant's.
drop policy if exists telegram_bot_state_select on public.telegram_bot_state;
create policy telegram_bot_state_select on public.telegram_bot_state
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members of the tenant a shared copy lives in read it from any active tenant, so the sharing panel lists it.
drop policy if exists telegram_bot_state_shared_select on public.telegram_bot_state;
create policy telegram_bot_state_shared_select on public.telegram_bot_state
  for select to authenticated
  using (
    shared_from_state_id is not null
    and public.user_is_tenant_member(tenant_id)
  );

-- The owner of the active tenant adds its own bot; a shared copy goes through the sharing rule below.
drop policy if exists telegram_bot_state_owner_insert on public.telegram_bot_state;
create policy telegram_bot_state_owner_insert on public.telegram_bot_state
  for insert to authenticated
  with check (
    shared_from_state_id is null
    and public.has_role((select auth.uid()), 'owner'::public.app_role)
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- The owner of the active tenant edits its bot rows (connect, disconnect), which stay in that tenant.
drop policy if exists telegram_bot_state_owner_update on public.telegram_bot_state;
create policy telegram_bot_state_owner_update on public.telegram_bot_state
  for update to authenticated
  using (
    public.has_role((select auth.uid()), 'owner'::public.app_role)
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  )
  with check (
    public.has_role((select auth.uid()), 'owner'::public.app_role)
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- The owner of the active tenant removes its bot rows.
drop policy if exists telegram_bot_state_owner_delete on public.telegram_bot_state;
create policy telegram_bot_state_owner_delete on public.telegram_bot_state
  for delete to authenticated
  using (
    public.has_role((select auth.uid()), 'owner'::public.app_role)
    and tenant_id = public.get_user_tenant_id((select auth.uid()))
  );

-- A member of both tenants shares a bot of one into the other.
drop policy if exists telegram_bot_state_shared_insert on public.telegram_bot_state;
create policy telegram_bot_state_shared_insert on public.telegram_bot_state
  for insert to authenticated
  with check (
    shared_from_state_id is not null
    and public.user_is_tenant_member(tenant_id)
    and public.user_is_tenant_member(public.telegram_bot_state_source_tenant(shared_from_state_id))
  );

-- A member of the tenant holding a shared copy, or of the source bot's tenant, removes the copy.
drop policy if exists telegram_bot_state_shared_delete on public.telegram_bot_state;
create policy telegram_bot_state_shared_delete on public.telegram_bot_state
  for delete to authenticated
  using (
    shared_from_state_id is not null
    and (
      public.user_is_tenant_member(tenant_id)
      or public.user_is_tenant_member(public.telegram_bot_state_source_tenant(shared_from_state_id))
    )
  );

-- telegram_messages: Telegram chat history, written by telegram-poll, telegram-send and trigger-automation.

-- Members read their active tenant's Telegram messages; super admins read every tenant's.
drop policy if exists telegram_messages_select on public.telegram_messages;
create policy telegram_messages_select on public.telegram_messages
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Members add messages to their active tenant only.
drop policy if exists telegram_messages_insert on public.telegram_messages;
create policy telegram_messages_insert on public.telegram_messages
  for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- sync_jobs: ManyChat sync progress, shown on the ManyChat settings page.

-- Members read their active tenant's sync jobs; super admins read every tenant's.
drop policy if exists sync_jobs_select on public.sync_jobs;
create policy sync_jobs_select on public.sync_jobs
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Guard: each table has exactly the policies above, all TO authenticated. Permissive policies OR
-- together, so a leftover policy would widen access unnoticed.
do $$
declare
  v_expected constant jsonb := jsonb_build_object(
    'telephony_settings', jsonb_build_array('telephony_settings_insert', 'telephony_settings_select', 'telephony_settings_update'),
    'telegram_bot_state', jsonb_build_array(
      'telegram_bot_state_owner_delete', 'telegram_bot_state_owner_insert', 'telegram_bot_state_owner_update',
      'telegram_bot_state_select', 'telegram_bot_state_shared_delete', 'telegram_bot_state_shared_insert',
      'telegram_bot_state_shared_select'
    ),
    'telegram_messages', jsonb_build_array('telegram_messages_insert', 'telegram_messages_select'),
    'sync_jobs', jsonb_build_array('sync_jobs_select')
  );
  v_table text;
  v_names jsonb;
begin
  for v_table, v_names in select key, value from jsonb_each(v_expected) loop
    if (
      select coalesce(jsonb_agg(p.policyname order by p.policyname), '[]'::jsonb)
      from pg_policies as p
      where p.schemaname = 'public' and p.tablename = v_table
    ) is distinct from v_names then
      raise exception 'restore_messaging_settings_rls: % must have exactly the policies %', v_table, v_names;
    end if;
    if exists (
      select 1 from pg_policies as p
      where p.schemaname = 'public' and p.tablename = v_table
        and p.roles <> array['authenticated']::name[]
    ) then
      raise exception 'restore_messaging_settings_rls: a policy on % reaches more than authenticated', v_table;
    end if;
  end loop;
end;
$$;
