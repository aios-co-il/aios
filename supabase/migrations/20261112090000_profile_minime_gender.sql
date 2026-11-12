-- Which Mini Me set a user sees for Carmen: the male or the female figure. NULL means the user has
-- not chosen, and the app then follows profiles.gender, else the male set. Users set their own
-- value from the Carmen look picker under the existing "Users can update their own profile"
-- policy. Safe to re-run.

alter table public.profiles add column if not exists minime_gender text;

alter table public.profiles drop constraint if exists profiles_minime_gender_check;
alter table public.profiles add constraint profiles_minime_gender_check
  check (minime_gender is null or minime_gender in ('male', 'female'));

comment on column public.profiles.minime_gender is
  'Which Mini Me set this user sees: male, female, or NULL to follow profiles.gender (male when unknown).';
