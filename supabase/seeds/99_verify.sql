-- Fails the seed if any fragment silently skipped rows (`on conflict do nothing`)
-- or the handle_new_user trigger did not create profiles.
do $$
declare
  failures text[] := '{}';
  c record;
begin
  for c in
    select * from (values
      ('auth users',    (select count(*) from auth.users where email like '%@aios.test'), 4),
      ('auth identities', (select count(*) from auth.identities i join auth.users u on u.id = i.user_id where u.email like '%@aios.test'), 4),
      ('profiles',      (select count(*) from public.profiles where email like '%@aios.test'), 4),
      ('tenants',       (select count(*) from public.tenants where id::text like 'bbbbbbbb-%'), 3),
      ('tenant_users',  (select count(*) from public.tenant_users where tenant_id::text like 'bbbbbbbb-%'), 4),
      ('user_roles',    (select count(*) from public.user_roles where tenant_id::text like 'bbbbbbbb-%'), 4),
      ('agencies',      (select count(*) from public.agencies where id::text like 'cccccccc-%'), 1),
      ('clients',       (select count(*) from public.clients where id::text like 'dddddddd-%'), 2),
      ('leads',         (select count(*) from public.leads where id::text like 'eeeeeeee-%'), 2),
      ('tasks',         (select count(*) from public.tasks where id::text like 'ffffffff-%'), 1)
    ) as t(name, actual, expected)
    where actual <> expected
  loop
    failures := failures || format('%s: expected %s, found %s', c.name, c.expected, c.actual);
  end loop;

  if cardinality(failures) > 0 then
    raise exception 'seed verification failed: %', array_to_string(failures, '; ');
  end if;
end $$;
