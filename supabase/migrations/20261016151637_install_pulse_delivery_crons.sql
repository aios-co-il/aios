-- No-op. The `Install pulse delivery crons` workflow applied supabase/ops/install_pulse_delivery_crons.sql
-- to Production through the Supabase migrations API, which recorded this version without a file here.
-- Keeping the version locally lets `supabase db push` match the remote history (AIO-143).
SELECT 1;
