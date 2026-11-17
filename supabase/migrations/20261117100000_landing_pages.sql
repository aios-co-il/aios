-- No-op (AIO-602). This version first added a landing_pages table that the design
-- replaced before merge; it stays as a stub because the PR's Preview branch applied it.
-- The tenant check now lives in 20261117110000_landing_page_tenant_check.sql.
SELECT 1;
