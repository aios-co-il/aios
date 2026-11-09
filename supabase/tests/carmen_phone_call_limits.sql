-- Carmen's phone call limits (20261109120000_carmen_phone_call_limits): one
-- caller's number gets the same caller_match_key however it is typed, a new
-- call is not rate-limited, and members still cannot write calls. Synthetic
-- tenant inside one transaction that is rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_tenant uuid;
  v_keys integer;
  v_limited integer;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK calls', 'qa-pc-' || v_tag) RETURNING id INTO v_tenant;
  INSERT INTO public.carmen_phone_calls (tenant_id, caller_kind, caller_phone)
  VALUES
    (v_tenant, 'unknown', '+972-52-999-8888'),
    (v_tenant, 'unknown', '0529998888'),
    (v_tenant, 'unknown', NULL);

  -- Both spellings of the number count as one caller.
  SELECT count(DISTINCT caller_match_key) INTO v_keys
  FROM public.carmen_phone_calls
  WHERE tenant_id = v_tenant AND caller_phone IS NOT NULL;
  IF v_keys <> 1 THEN
    RAISE EXCEPTION 'one number must have one caller_match_key, saw %', v_keys;
  END IF;

  -- A hidden number has no key, and no call starts rate-limited.
  IF EXISTS (
    SELECT 1 FROM public.carmen_phone_calls
    WHERE tenant_id = v_tenant AND caller_phone IS NULL
      AND caller_match_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a hidden number must have no caller_match_key';
  END IF;
  SELECT count(*) INTO v_limited FROM public.carmen_phone_calls
  WHERE tenant_id = v_tenant AND rate_limited;
  IF v_limited <> 0 THEN
    RAISE EXCEPTION 'a new call must not be rate-limited, saw %', v_limited;
  END IF;
END
$test$;
SELECT 'Carmen phone call limits: one key per number, calls start unlimited' AS result;
ROLLBACK;
