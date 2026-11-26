-- Database calls to edge functions take the project's address from Vault
-- (secret `project_url`) instead of a literal `https://<ref>.supabase.co`
-- (AIO-192). The address then follows the environment: Production, the
-- persistent develop branch and each Preview branch call their own functions,
-- and a move to another region or the custom domain is a Vault change only.
--
-- 1. carmen_send_activation and claude_notify_david named Production's URL, so
--    every database built from the migrations (develop, Previews) posted to
--    Production. Bodies are Production's, with the URL read from Vault; a
--    missing secret stops the call instead of sending it elsewhere.
-- 2. Every cron job whose command names a supabase.co URL gets that URL
--    replaced with the Vault read used by automation-delay-worker-every-min,
--    carmen-manager-round-15m and carmen-reconcile-nightly. Only the URL text
--    changes: schedules, headers, keys, bodies and timeouts stay as they are,
--    so this migration carries no key. On Production that is 17 jobs whose
--    URL is the same address `project_url` holds today; databases without such
--    jobs are unchanged.
--
-- Not changed here: trigger_ad_account_blocked, trigger_auto_sync_new_lead and
-- trigger_carmen_learn_from_session post to another, unknown project. Pointing
-- them at this project would start lead syncs, automations and Carmen learning
-- that do not run today, so that decision stays with AIO-66. The keys some cron
-- commands carry inline move to Vault with AIO-83.

-- Sends a WhatsApp activation code to a phone through carmen-activate-phone.
CREATE OR REPLACE FUNCTION public.carmen_send_activation(p_tenant uuid, p_integration uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_bearer text;
  v_project_url text;
  v_code text;
  v_id uuid;
  v_req bigint;
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_digits) < 9 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  if exists (select 1 from public.wa_lid_map where phone = v_digits) then
    return jsonb_build_object('ok', true, 'skipped', 'already_mapped');
  end if;

  if exists (
    select 1 from public.wa_pending_activations
    where tenant_id = p_tenant and phone = v_digits and status = 'pending'
      and created_at > now() - interval '48 hours'
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'pending_exists');
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;

  if coalesce(v_project_url, '') = '' then
    raise warning 'carmen_send_activation: vault secret project_url is missing; no activation sent (tenant=%)', p_tenant;
    return jsonb_build_object('ok', false, 'error', 'project_url_missing');
  end if;

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into public.wa_pending_activations (tenant_id, integration_id, phone, code)
  values (p_tenant, p_integration, v_digits, v_code)
  returning id into v_id;

  select decrypted_secret into v_bearer
  from vault.decrypted_secrets where name = 'claude_mcp_bearer' limit 1;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/carmen-activate-phone',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_bearer, '')
    ),
    body := jsonb_build_object(
      'activation_id', v_id::text,
      'tenant_id', p_tenant::text,
      'integration_id', coalesce(p_integration::text, ''),
      'phone', v_digits,
      'code', v_code
    )
  ) into v_req;

  return jsonb_build_object('ok', true, 'activation_id', v_id, 'request_id', v_req);
end;
$function$;

REVOKE ALL ON FUNCTION public.carmen_send_activation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_send_activation(uuid, uuid, text) TO service_role;

-- Queues a WhatsApp message from Carmen's line through claude-notify.
CREATE OR REPLACE FUNCTION public.claude_notify_david(p_message text, p_tenant uuid DEFAULT '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019'::uuid, p_chat_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_bearer text;
  v_project_url text;
  v_req bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;

  -- Callers treat an error as "not delivered"; a missing secret must not look queued.
  if coalesce(v_project_url, '') = '' then
    raise exception 'claude_notify_david: vault secret project_url is missing';
  end if;

  select decrypted_secret into v_bearer
  from vault.decrypted_secrets where name = 'claude_mcp_bearer' limit 1;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/claude-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_bearer, '')
    ),
    body := jsonb_build_object('tenant_id', p_tenant::text, 'message', p_message)
            || case when p_chat_id is not null then jsonb_build_object('chat_id', p_chat_id) else '{}'::jsonb end
  ) into v_req;

  return jsonb_build_object('queued', true, 'request_id', v_req);
end;
$function$;

REVOKE ALL ON FUNCTION public.claude_notify_david(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claude_notify_david(text, uuid, text) TO service_role;

-- Cron jobs: replace each literal supabase.co base URL with the Vault read.
DO $$
DECLARE
  vault_url constant text :=
    'rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''project_url''), ''/'')';
  job record;
  new_command text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'functions URL: pg_cron not installed, cron jobs skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    RAISE WARNING 'functions URL: vault secret project_url is missing; rewritten cron jobs fail until it is set';
  END IF;

  FOR job IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command ~ 'https://[a-z0-9]+\.supabase\.co'
  LOOP
    -- 'https://<ref>.supabase.co' || '/functions/...'  and  'https://<ref>.supabase.co/functions/...'
    new_command := regexp_replace(
      job.command,
      '''https://[a-z0-9]+\.supabase\.co''\s*\|\|\s*''',
      vault_url || ' || ''',
      'g'
    );
    new_command := regexp_replace(
      new_command,
      '''https://[a-z0-9]+\.supabase\.co/',
      vault_url || ' || ''/',
      'g'
    );

    IF new_command ~ 'supabase\.co' THEN
      RAISE WARNING 'functions URL: cron job % has a supabase.co URL in another form; left unchanged', job.jobname;
      CONTINUE;
    END IF;

    PERFORM cron.alter_job(job_id := job.jobid, command := new_command);
    RAISE NOTICE 'functions URL: cron job % now reads project_url', job.jobname;
  END LOOP;
END;
$$;
