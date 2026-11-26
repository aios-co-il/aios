-- Green API webhook tokens in Vault (20261126220000_green_api_webhook_token.sql).
-- Synthetic tenant, user and lines; full rollback. Runs on a scratch database,
-- a Preview branch or Staging.
--
-- - The service role stores a line's token; a new token keeps the one it
--   replaced as the previous token, and green_api_webhook_tokens returns both.
-- - No browser role may store or read a token, the line's owner included.
-- - Only a Green API line takes a token.
-- - Moving a line to another instance, or deleting it, forgets its tokens; any
--   other update keeps them.
BEGIN;
DO $test$
DECLARE
  tag text := left(gen_random_uuid()::text, 8);
  tenant_id_ uuid;
  owner_id uuid := gen_random_uuid();
  line_id uuid;
  other_id uuid;
  got text;
  n bigint;
  failures text[] := '{}';
BEGIN
  INSERT INTO public.tenants (name, slug) VALUES ('QA green token', 'qa-green-token-' || tag)
    RETURNING id INTO tenant_id_;
  INSERT INTO auth.users (id, email) VALUES
    (owner_id, 'qa-green-token-' || tag || '-owner@example.invalid');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES (tenant_id_, owner_id, 'owner');
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, api_key, instance_id, is_active)
  VALUES (tenant_id_, owner_id, 'green_api', 'qa-green-key', 'qa-' || tag, true)
  RETURNING id INTO line_id;
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, api_key)
  VALUES (tenant_id_, owner_id, 'sumit', 'qa-sumit-key')
  RETURNING id INTO other_id;

  -- The service role, which configure-green-api uses, stores a first token.
  SET LOCAL ROLE service_role;
  PERFORM public.store_green_api_webhook_token(line_id, 'tok-1');
  SELECT coalesce(current_token, '-') || '/' || coalesce(previous_token, '-') INTO got
  FROM public.green_api_webhook_tokens(line_id);
  IF got IS DISTINCT FROM 'tok-1/-' THEN
    failures := failures || format('first token: got %s, want tok-1/-', coalesce(got, 'no row'));
  END IF;

  -- A new token keeps the replaced one as previous.
  PERFORM public.store_green_api_webhook_token(line_id, 'tok-2');
  SELECT coalesce(current_token, '-') || '/' || coalesce(previous_token, '-') INTO got
  FROM public.green_api_webhook_tokens(line_id);
  IF got IS DISTINCT FROM 'tok-2/tok-1' THEN
    failures := failures || format('second token: got %s, want tok-2/tok-1', coalesce(got, 'no row'));
  END IF;

  -- Only a Green API line takes a token.
  BEGIN
    PERFORM public.store_green_api_webhook_token(other_id, 'tok-x');
    failures := failures || 'a non-Green line took a webhook token';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  RESET ROLE;

  -- No browser role stores or reads a token: the owner, anon.
  FOR got IN SELECT unnest(array['owner', 'anon']) LOOP
    PERFORM set_config('request.jwt.claims',
      CASE got WHEN 'owner' THEN jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text
      ELSE '' END, true);
    EXECUTE format('SET LOCAL ROLE %I', CASE got WHEN 'anon' THEN 'anon' ELSE 'authenticated' END);
    BEGIN
      PERFORM public.green_api_webhook_tokens(line_id);
      failures := failures || format('%s read a webhook token', got);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.store_green_api_webhook_token(line_id, 'planted');
      failures := failures || format('%s stored a webhook token', got);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;

  -- An update that keeps the instance keeps the tokens.
  UPDATE public.tenant_integrations SET api_key = 'qa-green-key-2', instance_id = 'qa-' || tag
    WHERE id = line_id;
  SELECT count(*) INTO n FROM public.green_api_webhook_tokens(line_id);
  IF n <> 1 THEN
    failures := failures || 'an update that kept the instance forgot the tokens';
  END IF;

  -- Moving the line to another instance forgets them.
  UPDATE public.tenant_integrations SET instance_id = 'qa-moved-' || tag WHERE id = line_id;
  SELECT count(*) INTO n FROM vault.secrets
  WHERE name IN (public.green_api_webhook_secret_name('current', line_id),
                 public.green_api_webhook_secret_name('previous', line_id));
  IF n <> 0 THEN
    failures := failures || 'tokens outlived an instance change';
  END IF;

  -- Deleting the line forgets a token stored after the move.
  SET LOCAL ROLE service_role;
  PERFORM public.store_green_api_webhook_token(line_id, 'tok-3');
  RESET ROLE;
  DELETE FROM public.tenant_integrations WHERE id = line_id;
  SELECT count(*) INTO n FROM vault.secrets
  WHERE name = public.green_api_webhook_secret_name('current', line_id);
  IF n <> 0 THEN
    failures := failures || 'a token outlived its line';
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'green_api_webhook_token failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Green API webhook tokens: service role only, forgotten with their line' AS result;
ROLLBACK;
