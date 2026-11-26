-- Google tokens moved to integration_secrets (20261126110000_move_google_tokens.sql).
-- Synthetic tenant, users and rows; full rollback. Runs on a scratch database,
-- a Preview branch or Staging.
--
-- - A Google row written with tokens is saved without them; integration_secrets
--   holds them. This holds for the owner writing from the browser too.
-- - A write without a token keeps the stored one (a member saving a setting).
-- - A member reading the row sees no token.
-- - Double-encoded settings (a JSON string) are decoded and lose their token.
-- - Other integration types keep their api_key.
BEGIN;
DO $test$
DECLARE
  tag text := left(gen_random_uuid()::text, 8);
  tenant_id_ uuid;
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  google_id uuid;
  other_id uuid;
  got text;
  failures text[] := '{}';
BEGIN
  INSERT INTO public.tenants (name, slug) VALUES ('QA move', 'qa-move-' || tag)
    RETURNING id INTO tenant_id_;
  INSERT INTO auth.users (id, email) VALUES
    (owner_id, 'qa-move-' || tag || '-owner@example.invalid'),
    (member_id, 'qa-move-' || tag || '-member@example.invalid');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (tenant_id_, owner_id, 'owner'), (tenant_id_, member_id, 'member');

  -- The owner connects Search Console from the browser, tokens included.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, api_key, settings)
  VALUES (tenant_id_, owner_id, 'google_search_console', 'access-1',
    jsonb_build_object('refresh_token', 'refresh-1', 'google_email', 'qa@example.invalid'))
  RETURNING id INTO google_id;
  RESET ROLE;

  SELECT coalesce(api_key, '-') || '/' || coalesce(settings ->> 'refresh_token', '-') INTO got
  FROM public.tenant_integrations WHERE id = google_id;
  IF got IS DISTINCT FROM '-/-' THEN
    failures := failures || format('insert: the row kept %s, want no tokens', got);
  END IF;
  SELECT access_token || '/' || refresh_token INTO got
  FROM public.integration_secrets WHERE integration_id = google_id;
  IF got IS DISTINCT FROM 'access-1/refresh-1' THEN
    failures := failures || format('insert: secrets got %s, want access-1/refresh-1', coalesce(got, 'no row'));
  END IF;

  -- The owner saves a site choice from the browser: settings without the
  -- refresh token, which the browser never has.
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.tenant_integrations
      SET settings = jsonb_build_object('google_email', 'qa@example.invalid', 'site', 'sc-domain:qa.invalid')
      WHERE id = google_id;
  EXCEPTION WHEN insufficient_privilege THEN
    failures := failures || 'the owner could not save a setting';
  END;
  RESET ROLE;
  SELECT settings ->> 'site' INTO got FROM public.tenant_integrations WHERE id = google_id;
  IF got IS DISTINCT FROM 'sc-domain:qa.invalid' THEN
    failures := failures || format('the owner''s setting was not saved: got %s', coalesce(got, 'null'));
  END IF;

  -- What a member reads from the row: no token.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', member_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT coalesce(api_key, '-') || '/' || coalesce(settings ->> 'refresh_token', '-') INTO got
  FROM public.tenant_integrations WHERE id = google_id;
  IF got IS NOT NULL AND got <> '-/-' THEN
    failures := failures || format('a member read %s from the row', got);
  END IF;
  RESET ROLE;

  -- A member inserts with the owner's connection id and skips the conflict:
  -- refused, and the owner's tokens and tenant stay.
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.tenant_integrations (id, tenant_id, user_id, integration_type, api_key)
    VALUES (google_id, tenant_id_, member_id, 'google_search_console', 'stolen')
    ON CONFLICT (id) DO NOTHING;
    failures := failures || 'a member''s insert with the owner''s connection id was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RESET ROLE;
  SELECT access_token || '/' || tenant_id::text INTO got
  FROM public.integration_secrets WHERE integration_id = google_id;
  IF got IS DISTINCT FROM 'access-1/' || tenant_id_::text THEN
    failures := failures || format('a member''s conflicting insert changed the secrets: got %s', coalesce(got, 'no row'));
  END IF;

  SELECT refresh_token INTO got FROM public.integration_secrets WHERE integration_id = google_id;
  IF got IS DISTINCT FROM 'refresh-1' THEN
    failures := failures || format('a save without a token dropped it: got %s, want refresh-1', coalesce(got, 'null'));
  END IF;

  -- The server refreshes the access token: only it changes.
  UPDATE public.tenant_integrations SET api_key = 'access-2' WHERE id = google_id;
  SELECT coalesce((SELECT api_key FROM public.tenant_integrations WHERE id = google_id), '-')
    || '/' || access_token || '/' || refresh_token INTO got
  FROM public.integration_secrets WHERE integration_id = google_id;
  IF got IS DISTINCT FROM '-/access-2/refresh-1' THEN
    failures := failures || format('refresh: got %s, want -/access-2/refresh-1', coalesce(got, 'no row'));
  END IF;

  -- Settings saved as a JSON string: the row gets the object without the
  -- refresh token, and the token is stored.
  UPDATE public.tenant_integrations
    SET settings = to_jsonb('{"refresh_token": "refresh-2", "site": "sc-domain:qa.invalid"}'::text)
    WHERE id = google_id;
  SELECT jsonb_typeof(settings) || '/' || coalesce(settings ->> 'site', '-')
    || '/' || (settings::text LIKE '%refresh-2%')::text INTO got
  FROM public.tenant_integrations WHERE id = google_id;
  IF got IS DISTINCT FROM 'object/sc-domain:qa.invalid/false' THEN
    failures := failures || format('string settings: the row has %s, want object/sc-domain:qa.invalid/false', coalesce(got, 'null'));
  END IF;
  SELECT refresh_token INTO got FROM public.integration_secrets WHERE integration_id = google_id;
  IF got IS DISTINCT FROM 'refresh-2' THEN
    failures := failures || format('string settings: secrets got %s, want refresh-2', coalesce(got, 'null'));
  END IF;

  -- Other integration types keep their api_key on the row.
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, api_key)
  VALUES (tenant_id_, owner_id, 'sumit', 'qa-sumit-key') RETURNING id INTO other_id;
  SELECT api_key INTO got FROM public.tenant_integrations WHERE id = other_id;
  IF got IS DISTINCT FROM 'qa-sumit-key' THEN
    failures := failures || format('a non-Google row lost its api_key: got %s', coalesce(got, 'null'));
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'move_google_tokens failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Google tokens: moved to integration_secrets, never kept on the row' AS result;
ROLLBACK;
