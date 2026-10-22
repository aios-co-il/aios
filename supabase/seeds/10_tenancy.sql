-- Demo tenants. The Carmen tenant id is fixed so CARMEN_TENANT_ID can point at it.
-- allow_super_admin_access is required for super admins to see a tenant's data (RLS).
insert into public.tenants (id, name, slug, org_type, status, allow_super_admin_access) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Demo Agency', 'demo-agency', 'organization', 'active', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Demo Client', 'demo-client', 'organization', 'active', true),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Carmen',      'carmen',      'organization', 'active', true)
on conflict (id) do nothing;

insert into public.tenant_users (tenant_id, user_id, role)
select t.tenant_id::uuid, t.user_id::uuid, t.role from (values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'member'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000004', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'admin')
) as t(tenant_id, user_id, role)
where not exists (
  select 1 from public.tenant_users x
  where x.tenant_id = t.tenant_id::uuid and x.user_id = t.user_id::uuid
);

insert into public.user_roles (user_id, role, tenant_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'super_admin',  'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner',        'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'agency_owner', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'owner',        'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'campaigner',   'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'owner',        'bbbbbbbb-0000-0000-0000-000000000003'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'owner',        'bbbbbbbb-0000-0000-0000-000000000002')
on conflict do nothing;
