-- AIO-240: report share links returned each table's full integration_settings,
-- credentials included (webhook_secret, tokens, API keys). public-table and
-- public-dashboard now return only the display settings the shared pages read,
-- and public-table filters cached SEO bodies again when it reads them.
--
-- Bodies cached before that still hold the full settings at rest, and an
-- expired row is removed only when the same link is opened again. Drop every
-- cached body; each link rebuilds its own on the next view (10-minute TTL).
-- Safe to re-run.
DELETE FROM public.seo_share_response_cache;
