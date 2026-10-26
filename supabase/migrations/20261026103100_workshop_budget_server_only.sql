-- The project budget (payload.workshop_budget) is approved by the user's code and written by
-- the edge functions with the service role. A tenant member who can update the work item
-- under RLS must not be able to raise the cap or reset the spend by editing the payload.

create or replace function public.workshop_protect_budget()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', auth.role(), '') in ('authenticated', 'anon')
     and (new.payload -> 'workshop_budget') is distinct from (old.payload -> 'workshop_budget') then
    new.payload := case
      when old.payload ? 'workshop_budget'
        then jsonb_set(coalesce(new.payload, '{}'::jsonb), '{workshop_budget}', old.payload -> 'workshop_budget')
      else coalesce(new.payload, '{}'::jsonb) - 'workshop_budget'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_protect_budget on public.marketing_work_items;
create trigger workshop_protect_budget
  before update of payload on public.marketing_work_items
  for each row execute function public.workshop_protect_budget();
