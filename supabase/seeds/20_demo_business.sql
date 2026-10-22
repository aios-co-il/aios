-- Demo business rows. Phone numbers use the 972-50-000-xxxx range, which is not
-- assigned to real subscribers. See docs/supabase-seed.md for who sees what.
insert into public.agencies (id, name, email, phone, tenant_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'Demo Agency A', 'agency-a@aios.test', '+972500000001', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002', 'Demo Agency B', 'agency-b@aios.test', '+972500000002', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000003', 'Client Org Agency', 'client-org@aios.test', '+972500000003', 'bbbbbbbb-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.clients (id, agency_id, tenant_id, name, email, phone) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Acme Dental',   'acme@aios.test',  '+972500000101'),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Beta Fitness',  'beta@aios.test',  '+972500000102'),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Gamma Bakery',  'gamma@aios.test', '+972500000103'),
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'Delta Studio',  'delta@aios.test', '+972500000104')
on conflict (id) do nothing;

insert into public.leads (id, agency_id, tenant_id, client_id, company_name, email, phone) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Lead One Ltd',   'lead1@aios.test', '+972500000201'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'Lead Two Ltd',   'lead2@aios.test', '+972500000202'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', 'Lead Three Ltd', 'lead3@aios.test', '+972500000203'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', 'Lead Four Ltd',  'lead4@aios.test', '+972500000204')
on conflict (id) do nothing;

insert into public.tasks (id, agency_id, tenant_id, client_id, title, created_by) values
  ('ffffffff-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Set up Acme Dental campaign', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ffffffff-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', 'Review Gamma Bakery budget',  'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ffffffff-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', 'Onboard Delta Studio',        'aaaaaaaa-0000-0000-0000-000000000005')
on conflict (id) do nothing;

-- The campaigner is assigned to Agency A and to the Acme Dental client only.
insert into public.campaigners (id, tenant_id, full_name) values
  ('99999999-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Dev Campaigner')
on conflict (id) do nothing;

update public.profiles set campaigner_id = '99999999-0000-0000-0000-000000000001'
where id = 'aaaaaaaa-0000-0000-0000-000000000003';

insert into public.campaigner_agencies (campaigner_id, agency_id)
select '99999999-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001'
where not exists (
  select 1 from public.campaigner_agencies
  where campaigner_id = '99999999-0000-0000-0000-000000000001'
    and agency_id = 'cccccccc-0000-0000-0000-000000000001'
);

insert into public.client_team (client_id, campaigner_id)
select 'dddddddd-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001'
where not exists (
  select 1 from public.client_team
  where client_id = 'dddddddd-0000-0000-0000-000000000001'
    and campaigner_id = '99999999-0000-0000-0000-000000000001'
);

-- Campaigners only see tasks assigned to them (tasks.campaigner_id).
update public.tasks set campaigner_id = '99999999-0000-0000-0000-000000000001'
where id = 'ffffffff-0000-0000-0000-000000000001';
