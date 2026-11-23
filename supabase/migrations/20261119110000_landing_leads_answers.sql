-- Landing page leads (AIO-607): a form can also ask for the company and the number of employees
-- (landing-pages form.fields). Each lead keeps those answers, so a failed delivery loses nothing.
-- The landing-pages app validates the employee ranges; the database only bounds the length.
alter table public.landing_leads
  add column company text check (company is null or char_length(company) between 1 and 120),
  add column employees text check (employees is null or char_length(employees) between 1 and 40);
