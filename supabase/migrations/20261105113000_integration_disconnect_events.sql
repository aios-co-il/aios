-- Integration disconnects reach this project and Carmen's pulse (AIO-342).
--
-- 1. trigger_integration_disconnected posted each lost Google connection to a
--    foreign project's trigger-automation (a literal URL and that project's
--    anon key), so the event never arrived here. It now reads `project_url`
--    and `service_role_key` from Vault, like the Carmen crons
--    (20261103092000_carmen_crons_after_vault.sql), and skips the call with a
--    WARNING when either is missing. Nothing in it can fail the update: the
--    stamp, the Vault reads and the call sit in one exception block.
--    No Production automation uses the integration_disconnected trigger today,
--    so this call starts no send.
-- 2. integration_disconnect_events records each disconnect: a connection that
--    was connected (active, not needs_reauth) and is flagged needs_reauth by a
--    sync or token refresh. A person switching a connection off is not a
--    disconnect. The event closes when the connection is active again without
--    needs_reauth. One open event per connection, so a connection that stays
--    disconnected never opens a second one.
-- 3. pulse_open_integration_disconnects(tenant) hands campaign-pulse-snapshot
--    the tenant's open events whose connection is still disconnected. The
--    pulse's connection_lost rule decides whether to send and to whom.
--
-- No replay: only a transition after this migration opens an event. A
-- connection that is already disconnected has none, so it is never alerted
-- until it reconnects and is lost again.
--
-- Re-running this file changes nothing: every object is created or replaced.

-- True when the connection's settings flag it for reauthorisation.
CREATE OR REPLACE FUNCTION public.integration_needs_reauth(p_settings jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT lower(COALESCE(p_settings ->> 'needs_reauth', 'false')) = 'true';
$$;

-- The provider name people see for an integration_type.
CREATE OR REPLACE FUNCTION public.integration_display_label(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_type
    WHEN 'google_analytics' THEN 'Google Analytics'
    WHEN 'google_search_console' THEN 'Google Search Console'
    WHEN 'google_ads' THEN 'Google Ads'
    WHEN 'google_calendar' THEN 'Google Calendar'
    WHEN 'gmail' THEN 'Gmail'
    WHEN 'facebook' THEN 'Facebook'
    WHEN 'facebook_lead_ads' THEN 'Facebook Lead Ads'
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'ahrefs' THEN 'Ahrefs'
    WHEN 'green_api' THEN 'WhatsApp (Green API)'
    WHEN 'manychat' THEN 'ManyChat'
    WHEN 'telegram' THEN 'Telegram'
    ELSE COALESCE(p_type, 'Integration')
  END;
$$;

REVOKE ALL ON FUNCTION public.integration_needs_reauth(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_needs_reauth(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.integration_display_label(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_display_label(text) TO service_role;

-- Calls this project's trigger-automation once a connection turns needs_reauth
-- (at most once a day per connection), with the URL and key from Vault.
CREATE OR REPLACE FUNCTION public.trigger_integration_disconnected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  last_trigger_at timestamptz;
  v_project_url text;
  v_service_key text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NOT (public.integration_needs_reauth(NEW.settings)
          AND NOT public.integration_needs_reauth(OLD.settings)) THEN
    RETURN NEW;
  END IF;

  -- Nothing in this block may fail the update: an unreadable stamp, a Vault
  -- read or a pg_net error only skips the call, with a WARNING.
  BEGIN
    last_trigger_at := (NEW.settings ->> 'last_disconnect_trigger_at')::timestamptz;
    IF last_trigger_at IS NOT NULL AND last_trigger_at > now() - interval '24 hours' THEN
      RAISE NOTICE 'integration_disconnected: integration % already reported in the last 24h', NEW.id;
      RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

    IF v_project_url IS NULL OR v_service_key IS NULL THEN
      RAISE WARNING 'integration_disconnected: vault secrets project_url / service_role_key missing, trigger-automation not called (tenant=%, integration=%)',
        NEW.tenant_id, NEW.id;
    ELSE
      PERFORM net.http_post(
        url := rtrim(v_project_url, '/') || '/functions/v1/trigger-automation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'trigger_type', 'integration_disconnected',
          'tenant_id', NEW.tenant_id,
          'data', jsonb_build_object(
            'integration_id', NEW.id,
            'integration_type', NEW.integration_type,
            'integration_name', public.integration_display_label(NEW.integration_type),
            'last_error', NEW.settings ->> 'last_auth_error',
            'last_error_at', NEW.settings ->> 'last_auth_error_at',
            'disconnected_at', now()
          )
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'integration_disconnected: trigger-automation not called (integration=%): %',
      NEW.id, SQLERRM;
  END;

  NEW.settings := COALESCE(NEW.settings, '{}'::jsonb)
    || jsonb_build_object('last_disconnect_trigger_at', now());

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_integration_disconnected() FROM PUBLIC, anon, authenticated;

-- One row per disconnect of a connection; reconnected_at closes it.
CREATE TABLE IF NOT EXISTS public.integration_disconnect_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.tenant_integrations (id) ON DELETE CASCADE,
  integration_type text NOT NULL,
  disconnected_at timestamptz NOT NULL DEFAULT now(),
  reconnected_at timestamptz,
  reason text,
  CONSTRAINT integration_disconnect_events_closed_after_open
    CHECK (reconnected_at IS NULL OR reconnected_at >= disconnected_at)
);

COMMENT ON TABLE public.integration_disconnect_events IS
  'Each lost connection (needs_reauth on a connected integration), closed on reconnect. Read by the pulse connection_lost rule (AIO-342).';

-- At most one open disconnect per connection.
CREATE UNIQUE INDEX IF NOT EXISTS integration_disconnect_events_one_open
  ON public.integration_disconnect_events (tenant_id, integration_id)
  WHERE reconnected_at IS NULL;

-- Server-only: RLS on with no policy, and no grant to signed-in users.
ALTER TABLE public.integration_disconnect_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integration_disconnect_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.integration_disconnect_events TO service_role;

-- Opens an event when a connected integration turns needs_reauth, and closes
-- the open one when it is active again without needs_reauth.
CREATE OR REPLACE FUNCTION public.record_integration_disconnect_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  was_connected boolean;
  is_connected boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NULL;
  END IF;

  was_connected := COALESCE(OLD.is_active, false)
    AND NOT public.integration_needs_reauth(OLD.settings);
  is_connected := COALESCE(NEW.is_active, false)
    AND NOT public.integration_needs_reauth(NEW.settings);

  IF was_connected AND public.integration_needs_reauth(NEW.settings) THEN
    INSERT INTO public.integration_disconnect_events
      (tenant_id, integration_id, integration_type, reason)
    VALUES
      (NEW.tenant_id, NEW.id, NEW.integration_type, NEW.settings ->> 'last_auth_error')
    ON CONFLICT (tenant_id, integration_id) WHERE reconnected_at IS NULL DO NOTHING;
  ELSIF is_connected AND NOT was_connected THEN
    -- A disconnect committed after this transaction began is later than now().
    UPDATE public.integration_disconnect_events
    SET reconnected_at = greatest(now(), disconnected_at)
    WHERE tenant_id = NEW.tenant_id
      AND integration_id = NEW.id
      AND reconnected_at IS NULL;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_integration_disconnect_event() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER on_integration_disconnect_event
  AFTER UPDATE OF is_active, settings ON public.tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION public.record_integration_disconnect_event();

-- The tenant's open disconnects whose connection is still disconnected, with
-- what the pulse alert names: the event (its dedupe key), the account, how
-- many report tables pin the connection, and the agency-shared orgs among
-- their owners.
CREATE OR REPLACE FUNCTION public.pulse_open_integration_disconnects(p_tenant_id uuid)
RETURNS TABLE (
  event_id uuid,
  integration_id uuid,
  integration_type text,
  provider_label text,
  account_label text,
  disconnected_at timestamptz,
  report_tables integer,
  shared_with_tenants text[]
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH open_events AS (
    SELECT e.id AS event_id, e.integration_id, e.tenant_id, e.disconnected_at, ti.integration_type,
           ti.display_name, ti.settings, ti.user_id
    FROM public.integration_disconnect_events e
    JOIN public.tenant_integrations ti
      ON ti.id = e.integration_id AND ti.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND e.reconnected_at IS NULL
      AND NOT (COALESCE(ti.is_active, false)
               AND NOT public.integration_needs_reauth(ti.settings))
  ),
  pinned AS (
    SELECT o.integration_id, ct.tenant_id AS table_tenant_id
    FROM open_events o
    JOIN public.crm_tables ct
      ON o.integration_id::text IN (
        ct.integration_settings ->> 'integrationId',
        ct.integration_settings ->> 'integration_id',
        ct.integration_settings ->> 'ga_integration_id',
        ct.integration_settings ->> 'gsc_integration_id'
      )
  )
  SELECT
    o.event_id,
    o.integration_id,
    o.integration_type,
    public.integration_display_label(o.integration_type),
    COALESCE(
      NULLIF(btrim(o.display_name), ''),
      NULLIF(o.settings ->> 'google_email', ''),
      NULLIF(o.settings ->> 'email', ''),
      NULLIF(o.settings ->> 'page_name', ''),
      p.email
    ),
    o.disconnected_at,
    (SELECT count(*)::integer FROM pinned WHERE pinned.integration_id = o.integration_id),
    ARRAY(
      SELECT DISTINCT t.name
      FROM pinned
      JOIN public.tenants t ON t.id = pinned.table_tenant_id
      WHERE pinned.integration_id = o.integration_id
        AND pinned.table_tenant_id <> o.tenant_id
        AND EXISTS (
          SELECT 1 FROM public.agency_tenant_access g
          WHERE (g.source_tenant_id = o.tenant_id AND g.accessing_tenant_id = pinned.table_tenant_id)
             OR (g.accessing_tenant_id = o.tenant_id AND g.source_tenant_id = pinned.table_tenant_id)
        )
      ORDER BY t.name
    )
  FROM open_events o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  ORDER BY o.disconnected_at, o.integration_id;
$$;

REVOKE ALL ON FUNCTION public.pulse_open_integration_disconnects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pulse_open_integration_disconnects(uuid) TO service_role;
