-- Which leads the Leads screen opens on, saved per user and per tenant so it
-- follows the user to every device. stage_scope 'all' opens every pipeline
-- stage; 'new' opens only the tenant's first stage. No row means the screen
-- keeps its built-in default (new leads in chat, all elsewhere).
-- Safe to re-apply.

create table if not exists public.lead_list_defaults (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  stage_scope text not null check (stage_scope in ('all', 'new')),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

drop trigger if exists update_lead_list_defaults_updated_at on public.lead_list_defaults;
create trigger update_lead_list_defaults_updated_at
  before update on public.lead_list_defaults
  for each row execute function public.update_updated_at_column();

alter table public.lead_list_defaults enable row level security;

-- A user reads only their own default, in a tenant they belong to.
drop policy if exists "Users read their own lead list default" on public.lead_list_defaults;
create policy "Users read their own lead list default"
  on public.lead_list_defaults
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and (public.user_is_tenant_member(tenant_id) or public.is_super_admin(auth.uid()))
  );

-- A user saves a default only as themselves, in a tenant they belong to.
drop policy if exists "Users insert their own lead list default" on public.lead_list_defaults;
create policy "Users insert their own lead list default"
  on public.lead_list_defaults
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (public.user_is_tenant_member(tenant_id) or public.is_super_admin(auth.uid()))
  );

-- A user changes only their own default and cannot move it to another user or tenant.
drop policy if exists "Users update their own lead list default" on public.lead_list_defaults;
create policy "Users update their own lead list default"
  on public.lead_list_defaults
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (public.user_is_tenant_member(tenant_id) or public.is_super_admin(auth.uid()))
  );

revoke all on public.lead_list_defaults from public, anon, authenticated;
grant select, insert, update on public.lead_list_defaults to authenticated;
grant all on public.lead_list_defaults to service_role;
