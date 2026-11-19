-- Google Calendar tokens (20261119120000_lock_calendar_tokens.sql) as each
-- persona meets them. Synthetic users and rows; full rollback. Runs on a
-- scratch database, a Preview branch or Staging.
--
-- No browser role reads, writes or deletes a calendar_tokens row, not even
-- the owner's own; the service role still does.
BEGIN;
DO $test$
DECLARE
  tag text := left(gen_random_uuid()::text, 8);
  owner_id uuid := gen_random_uuid();
  persona record;
  n bigint;
  acts text;
  failures text[] := '{}';
  lines text[] := '{}';
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (owner_id, 'qa-calendar-tokens-' || tag || '@example.invalid');
  INSERT INTO public.calendar_tokens (user_id, access_token, refresh_token, expires_at)
  VALUES (owner_id, 'qa-access-' || tag, 'qa-refresh-' || tag, now() + interval '1 hour');

  FOR persona IN
    SELECT * FROM (VALUES ('owner', 'authenticated', owner_id), ('anon', 'anon', NULL::uuid)) AS v(name, role, uid)
  LOOP
    PERFORM set_config('request.jwt.claims',
      CASE WHEN persona.uid IS NULL THEN ''
        ELSE jsonb_build_object('sub', persona.uid, 'role', 'authenticated')::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', persona.role);
    acts := '';

    BEGIN
      SELECT count(*) INTO n FROM public.calendar_tokens;
      IF n > 0 THEN acts := acts || 'R'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      UPDATE public.calendar_tokens SET refresh_token = 'stolen' WHERE user_id = owner_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'U'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      INSERT INTO public.calendar_tokens (user_id, access_token, refresh_token, expires_at)
      VALUES (owner_id, 'forged', 'forged', now());
      acts := acts || 'I';
    EXCEPTION WHEN insufficient_privilege OR unique_violation THEN NULL;
    END;
    BEGIN
      DELETE FROM public.calendar_tokens WHERE user_id = owner_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'D'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    RESET ROLE;
    lines := lines || format('%-6s %s', persona.name, coalesce(nullif(acts, ''), '-'));
    IF acts <> '' THEN
      failures := failures || format('%s reached calendar_tokens: %s', persona.name, acts);
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM public.calendar_tokens
  WHERE user_id = owner_id AND refresh_token = 'qa-refresh-' || tag;
  IF n <> 1 THEN
    failures := failures || 'the owner''s row changed or vanished';
  END IF;

  SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM public.calendar_tokens WHERE user_id = owner_id;
  RESET ROLE;
  IF n <> 1 THEN
    failures := failures || 'service_role cannot read calendar_tokens';
  END IF;

  RAISE NOTICE E'lock_calendar_tokens (R read, U update, I insert, D delete)\n%', array_to_string(lines, E'\n');
  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'lock_calendar_tokens failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Calendar tokens: no browser role reads or writes them; the service role does' AS result;
ROLLBACK;
