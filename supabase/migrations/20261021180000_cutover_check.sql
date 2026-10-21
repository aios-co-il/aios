-- AIO-147 cutover check: no-op migration to verify a PR deploys without the staging label.
COMMENT ON TABLE public.tenant_heartbeat_settings IS
  'Per-tenant heartbeat and agent task dispatcher settings.';
