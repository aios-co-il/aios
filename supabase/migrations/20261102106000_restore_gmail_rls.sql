-- Gmail access rules: restore the row-level security policies the Production
-- baseline (20261009000000) lost on the Gmail settings tables, and let the
-- app check a user's Gmail connection without reading the OAuth tokens.
--
-- gmail_allowed_labels, gmail_blocked_senders, gmail_category_rules,
-- gmail_message_categories, gmail_categories and gmail_tokens have RLS on and
-- no policies in Production and Staging. A signed-in user sees no labels,
-- blocked senders, rules or categories (Gmail and Gmail settings pages), every
-- save fails with 42501, and Gmail always shows as not connected.
--
-- The rule is the one these tables had before the baseline: labels, blocked
-- senders, subject rules and message categories belong to one user; the
-- category list is shared by the tenant, and a super admin reaches every
-- tenant's.
--
-- gmail_tokens holds each user's Google access and refresh tokens. Before the
-- baseline its owner could read them from the browser. The app only needs to
-- know whether Gmail is connected and from which address, so gmail_tokens now
-- keeps no policies (service role only: gmail-auth, gmail-api and
-- process-invoice-emails) and get_user_gmail_connection returns the address
-- alone. It is keyed by user, as the token policies were: gmail_tokens.user_id
-- is unique, and a connection follows its user across tenants.
--
-- No data changes.

-- Returns the caller's Gmail address: one row when Gmail is connected, none otherwise; never the tokens.
create or replace function public.get_user_gmail_connection()
returns table (google_email text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.google_email
  from public.gmail_tokens t
  where t.user_id = (select auth.uid())
$$;

revoke all on function public.get_user_gmail_connection() from public, anon, authenticated;
grant execute on function public.get_user_gmail_connection() to authenticated;

-- Personal Gmail settings: each row belongs to one user.

-- A user manages only their own allowed Gmail labels.
drop policy if exists gmail_allowed_labels_own on public.gmail_allowed_labels;
create policy gmail_allowed_labels_own on public.gmail_allowed_labels
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A user manages only their own blocked senders.
drop policy if exists gmail_blocked_senders_own on public.gmail_blocked_senders;
create policy gmail_blocked_senders_own on public.gmail_blocked_senders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A user manages only their own subject-to-category rules.
drop policy if exists gmail_category_rules_own on public.gmail_category_rules;
create policy gmail_category_rules_own on public.gmail_category_rules
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A user manages only the categories they put on their own messages.
drop policy if exists gmail_message_categories_own on public.gmail_message_categories;
create policy gmail_message_categories_own on public.gmail_message_categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Shared category list.

-- Members manage their tenant's Gmail categories and cannot move one to another tenant; super admins any.
drop policy if exists gmail_categories_all on public.gmail_categories;
create policy gmail_categories_all on public.gmail_categories
  for all to authenticated
  using (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  )
  with check (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    or public.is_super_admin((select auth.uid()))
  );

-- Guard: the five settings tables have policies and none reaches anon; gmail_tokens has none.
do $$
declare
  v_tables text[] := array[
    'gmail_allowed_labels', 'gmail_blocked_senders', 'gmail_category_rules',
    'gmail_message_categories', 'gmail_categories'
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
    raise exception 'restore_gmail_rls: no policies on %', v_bare;
  end if;

  select string_agg(distinct p.tablename, ', ') into v_wide
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = any (v_tables)
    and p.roles <> array['authenticated']::name[];
  if v_wide is not null then
    raise exception 'restore_gmail_rls: a policy reaches more than authenticated on %', v_wide;
  end if;

  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'gmail_tokens') then
    raise exception 'restore_gmail_rls: gmail_tokens has a policy; its tokens must stay service-role only';
  end if;
end;
$$;
