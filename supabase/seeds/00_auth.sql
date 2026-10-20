-- Dev-only login users. All share the password `devdev12`; emails use the
-- reserved .test TLD so nothing can be delivered. `handle_new_user` creates the
-- matching public.profiles rows.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, extensions.crypt('devdev12', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'admin@aios.test',   'Dev Super Admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'agency@aios.test',  'Dev Agency Owner'),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'user@aios.test',    'Dev Client User'),
  ('aaaaaaaa-0000-0000-0000-000000000004'::uuid, 'carmen@aios.test',  'Carmen Service User')
) as u(id, email, full_name)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users
where email like '%@aios.test'
on conflict (provider_id, provider) do nothing;
