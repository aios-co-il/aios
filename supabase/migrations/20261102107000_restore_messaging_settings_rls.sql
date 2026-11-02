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
-- Changes against the policies these tables had before the baseline:
-- - Every policy is TO authenticated; sync_jobs' were TO public.
-- - telegram_bot_state sharing: the insert and delete rules compared
--   shared_from_state_id with itself, so sharing a bot never matched. They now
--   check the source row. A shared copy is also readable by members of the
--   tenant it lives in, so the source tenant's sharing panel can list and
--   remove its copies.
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
-- that met the old indexes meet it, and the function names it.
--
-- No data changes.

-- One own bot per tenant (shared_from_state_id null) and one copy per source bot per tenant.
create unique index if not exists telegram_bot_state_tenant_source_unique
  on public.telegram_bot_state (tenant_id, shared_from_state_id) nulls not distinct;

drop index if exists public.telegram_bot_state_tenant_primary_unique;
drop index if exists public.telegram_bot_state_tenant_shared_unique;

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
-- The sharing rules read the source row from this table. Postgres allows that only while the
-- policies that apply to a SELECT here (owner_all, select, shared_select) contain no sublink, so
-- those three call auth.uid() directly instead of (select auth.uid()), which is a sublink.

-- The owner of the active tenant manages its bot rows; super admins manage every tenant's.
drop policy if exists telegram_bot_state_owner_all on public.telegram_bot_state;
create policy telegram_bot_state_owner_all on public.telegram_bot_state
  for all to authenticated
  using (
    (public.has_role(auth.uid(), 'owner'::public.app_role)
      and tenant_id = public.get_user_tenant_id(auth.uid()))
    or public.is_super_admin(auth.uid())
  )
  with check (
    (public.has_role(auth.uid(), 'owner'::public.app_role)
      and tenant_id = public.get_user_tenant_id(auth.uid()))
    or public.is_super_admin(auth.uid())
  );

-- Members read their active tenant's bot rows; super admins read every tenant's.
drop policy if exists telegram_bot_state_select on public.telegram_bot_state;
create policy telegram_bot_state_select on public.telegram_bot_state
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id(auth.uid())
    or public.is_super_admin(auth.uid())
  );

-- Members of the tenant a shared copy lives in read it from any active tenant, so the sharing panel lists it.
drop policy if exists telegram_bot_state_shared_select on public.telegram_bot_state;
create policy telegram_bot_state_shared_select on public.telegram_bot_state
  for select to authenticated
  using (
    shared_from_state_id is not null
    and public.user_is_tenant_member(tenant_id)
  );

-- A member of both tenants shares a bot they can read into the other tenant.
drop policy if exists telegram_bot_state_shared_insert on public.telegram_bot_state;
create policy telegram_bot_state_shared_insert on public.telegram_bot_state
  for insert to authenticated
  with check (
    shared_from_state_id is not null
    and public.user_is_tenant_member(tenant_id)
    and exists (
      select 1
      from public.telegram_bot_state as src
      where src.id = telegram_bot_state.shared_from_state_id
        and public.user_is_tenant_member(src.tenant_id)
    )
  );

-- A member of the tenant holding a shared copy, or of the source bot's tenant, removes the copy.
drop policy if exists telegram_bot_state_shared_delete on public.telegram_bot_state;
create policy telegram_bot_state_shared_delete on public.telegram_bot_state
  for delete to authenticated
  using (
    shared_from_state_id is not null
    and (
      public.user_is_tenant_member(tenant_id)
      or exists (
        select 1
        from public.telegram_bot_state as src
        where src.id = telegram_bot_state.shared_from_state_id
          and public.user_is_tenant_member(src.tenant_id)
      )
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

-- Members add messages to their active tenant; super admins to any tenant.
drop policy if exists telegram_messages_insert on public.telegram_messages;
create policy telegram_messages_insert on public.telegram_messages
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- sync_jobs: ManyChat sync progress, shown on the ManyChat settings page.

-- Members read their active tenant's sync jobs; super admins read every tenant's.
drop policy if exists sync_jobs_select on public.sync_jobs;
create policy sync_jobs_select on public.sync_jobs
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

do $$
declare
  v_bare text;
begin
  select string_agg(t, ', ' order by t) into v_bare
  from unnest(array['telephony_settings', 'telegram_bot_state', 'telegram_messages', 'sync_jobs']) as t
  where not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
  );
  if v_bare is not null then
    raise exception 'Still without policies: %', v_bare;
  end if;
end;
$$;
