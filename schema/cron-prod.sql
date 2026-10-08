-- Read-only snapshot of cron.job on prod (zvoijyneresvkadpprel), 2026-10-14. 17 jobs.
-- Secrets are redacted. Do not apply as-is: restore keys from Vault and check approvals (report/WhatsApp sends).

-- jobid=17 active=true database=postgres username=postgres
select cron.schedule('autonomous-goal-worker', '* * * * *', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/autonomous-goal-worker',
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

-- jobid=1 active=true database=postgres username=postgres
select cron.schedule('broadcast-dispatch-every-min', '* * * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/broadcast-dispatch',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer <REDACTED_ANON_JWT>'
       ),
       body := '{}'::jsonb
     );$cron$);

-- jobid=2 active=true database=postgres username=postgres
select cron.schedule('broadcast-list-sync-hourly', '17 * * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/broadcast-list-sync-cron',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer <REDACTED_ANON_JWT>'
       ),
       body := '{}'::jsonb
     );$cron$);

-- jobid=25 active=true database=postgres username=postgres
select cron.schedule('campaign-pulse-sunday-0730', '30 4 * * 0', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/campaign-pulse-snapshot',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer <REDACTED_ANON_JWT>'
        ),
        body := jsonb_build_object(
          'deliver', true,
          'source', 'sunday_cron'
        ),
        timeout_milliseconds := 120000
      );$cron$);

-- jobid=9 active=true database=postgres username=postgres
select cron.schedule('carmen-health-probe', '*/10 * * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/carmen-health-probe',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <REDACTED_ANON_JWT>'),
       body := '{}'::jsonb
     );$cron$);

-- jobid=8 active=true database=postgres username=postgres
select cron.schedule('carmen-memory-worker-every-2min', '*/2 * * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/carmen-memory-worker',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <REDACTED_ANON_JWT>'),
       body := '{}'::jsonb
     );$cron$);

-- jobid=11 active=true database=postgres username=postgres
select cron.schedule('check-overdue-tasks-daily', '30 5 * * *', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/check-overdue-tasks',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'task_worker_anon_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );$cron$);

-- jobid=13 active=true database=postgres username=postgres
select cron.schedule('cron-sync-facebook-ecommerce-daily', '5 5,12 * * *', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/cron-sync-facebook-ecommerce',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer <REDACTED_ANON_JWT>'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );$cron$);

-- jobid=7 active=true database=postgres username=postgres
select cron.schedule('dispatch-agent-tasks-every-5min', '*/5 * * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/dispatch-agent-tasks',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <REDACTED_ANON_JWT>'),
       body := '{}'::jsonb
     );$cron$);

-- jobid=21 active=true database=postgres username=postgres
select cron.schedule('google-ads-operational-check-2h', '25 */2 * * *', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co' || '/functions/v1/cron-sync-google-ads',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || '<REDACTED_ANON_JWT>'
        ),
        body := '{"operational_only":true}'::jsonb,
        timeout_milliseconds := 120000
      );$cron$);

-- jobid=12 active=true database=postgres username=postgres
select cron.schedule('meeting-bot-reconcile-every-minute', '* * * * *', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/meeting-bot-reconcile',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'task_worker_anon_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );$cron$);

-- jobid=20 active=true database=postgres username=postgres
select cron.schedule('meta-operational-check-2h', '15 */2 * * *', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co' || '/functions/v1/fb-campaign-monitor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || '<REDACTED_ANON_JWT>'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );$cron$);

-- jobid=4 active=true database=postgres username=postgres
select cron.schedule('sync-facebook-insights-twice-daily', '0 5,12 * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/cron-sync-facebook-insights',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <REDACTED_ANON_JWT>'),
       body := '{}'::jsonb
     );$cron$);

-- jobid=5 active=true database=postgres username=postgres
select cron.schedule('sync-google-ads-twice-daily', '10 5,12 * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/cron-sync-google-ads',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <REDACTED_ANON_JWT>'),
       body := '{}'::jsonb
     );$cron$);

-- jobid=6 active=true database=postgres username=postgres
select cron.schedule('sync-google-analytics-twice-daily', '20 5,12 * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/cron-sync-google-analytics',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <REDACTED_ANON_JWT>'),
       body := '{}'::jsonb
     );$cron$);

-- jobid=26 active=true database=postgres username=postgres
select cron.schedule('sync-woocommerce-twice-daily', '45 4,11 * * *', $cron$select net.http_post(
       url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/cron-sync-woocommerce',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer <REDACTED_ANON_JWT>'
       ),
       body := '{}'::jsonb
     );$cron$);

-- jobid=10 active=true database=postgres username=postgres
select cron.schedule('task-notification-worker-every-minute', '* * * * *', $cron$SELECT net.http_post(
        url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/task-notification-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'task_worker_anon_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );$cron$);
