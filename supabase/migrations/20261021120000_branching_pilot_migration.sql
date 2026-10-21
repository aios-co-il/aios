-- AIO-147 branching pilot: no-op migration to exercise Supabase preview branches.
COMMENT ON TABLE public.tenant_heartbeat_settings IS
  'Per-tenant heartbeat and agent task dispatcher settings.';
