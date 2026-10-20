-- Demo business rows for the Demo Agency tenant. Phone numbers use the
-- 972-50-000-xxxx range, which is not assigned to real subscribers.
insert into public.agencies (id, name, email, phone, tenant_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'Demo Agency', 'agency@aios.test', '+972500000001',
   'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.clients (id, agency_id, tenant_id, name, email, phone) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'Acme Dental', 'acme@aios.test', '+972500000101'),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'Beta Fitness', 'beta@aios.test', '+972500000102')
on conflict (id) do nothing;

insert into public.leads (id, agency_id, tenant_id, client_id, company_name, email, phone) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'Lead One Ltd', 'lead1@aios.test', '+972500000201'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002',
   'Lead Two Ltd', 'lead2@aios.test', '+972500000202')
on conflict (id) do nothing;

insert into public.tasks (id, agency_id, tenant_id, client_id, title, created_by) values
  ('ffffffff-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'Set up Acme Dental campaign', 'aaaaaaaa-0000-0000-0000-000000000002')
on conflict (id) do nothing;
