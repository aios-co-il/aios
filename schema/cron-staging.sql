-- Read-only snapshot of cron.job on staging (mzjsuvatrzhciojmbbbm), 2026-10-14. 4 jobs.
-- Secrets are redacted. Do not apply as-is: restore keys from Vault and check approvals (report/WhatsApp sends).

-- jobid=5 active=true database=postgres username=postgres
select cron.schedule('autonomous-goal-worker', '* * * * *', $cron$SELECT net.http_post(
        url := 'https://mzjsuvatrzhciojmbbbm.supabase.co/functions/v1/autonomous-goal-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'task_worker_anon_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );$cron$);

-- jobid=4 active=true database=postgres username=postgres
select cron.schedule('campaign-pulse-sunday-0700', '0 4 * * 0', $cron$SELECT net.http_post(
        url := 'https://mzjsuvatrzhciojmbbbm.supabase.co/functions/v1/campaign-pulse-snapshot',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer <REDACTED_SB_SECRET>'
        ),
        body := jsonb_build_object(
          'deliver', true,
          'source', 'sunday_cron'
        ),
        timeout_milliseconds := 120000
      );$cron$);

-- jobid=11 active=true database=postgres username=postgres
select cron.schedule('google-ads-operational-check-2h', '25 */2 * * *', $cron$SELECT net.http_post(
        url := 'https://mzjsuvatrzhciojmbbbm.supabase.co' || '/functions/v1/cron-sync-google-ads',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || '<REDACTED_SB_SECRET>'
        ),
        body := '{"operational_only":true}'::jsonb,
        timeout_milliseconds := 120000
      );$cron$);

-- jobid=10 active=true database=postgres username=postgres
select cron.schedule('meta-operational-check-2h', '15 */2 * * *', $cron$SELECT net.http_post(
        url := 'https://mzjsuvatrzhciojmbbbm.supabase.co' || '/functions/v1/fb-campaign-monitor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || '<REDACTED_SB_SECRET>'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );$cron$);
