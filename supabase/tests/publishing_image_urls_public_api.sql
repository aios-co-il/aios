-- Stored magazine image URLs move to the public API address
-- (20261126090000_publishing_image_urls_public_api, AIO-647): runs the
-- migration file itself (\ir) without a Vault project_url, with a supabase.co
-- one, and with a custom domain, then again to show it is idempotent.
-- Synthetic rows with fixed ids; rolls back.
BEGIN;

-- One published article on an old proxy URL (in a client's report month),
-- one in review, and one whose URLs must never change.
INSERT INTO public.tenants (id, name, slug) VALUES
  ('0a647000-0000-4000-8000-000000000001', 'QA ROLLBACK publishing image', 'qa-rollback-' || gen_random_uuid());
INSERT INTO public.agencies (id, tenant_id, name) VALUES
  ('0a647000-0000-4000-8000-000000000002', '0a647000-0000-4000-8000-000000000001', 'QA ROLLBACK agency');
INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES
  ('0a647000-0000-4000-8000-000000000003', '0a647000-0000-4000-8000-000000000001',
   '0a647000-0000-4000-8000-000000000002', 'QA ROLLBACK client');

INSERT INTO public.publishing_articles
  (id, tenant_id, client_id, primary_keyword, status, title, live_url, source_month, hero_image_url, inline_image_url)
VALUES
  ('0a647000-0000-4000-8000-0000000000a1', '0a647000-0000-4000-8000-000000000001',
   '0a647000-0000-4000-8000-000000000003', 'QA ROLLBACK published', 'published', 'QA published',
   'https://pbn.example.test/qa', '2026-10-01',
   'https://abcdefghijklmnopqrst.supabase.co/functions/v1/publishing-image?article_id=0a647000-0000-4000-8000-0000000000a1&kind=hero',
   'https://abcdefghijklmnopqrst.supabase.co/functions/v1/publishing-image?article_id=0a647000-0000-4000-8000-0000000000a1&kind=inline'),
  ('0a647000-0000-4000-8000-0000000000a2', '0a647000-0000-4000-8000-000000000001',
   NULL, 'QA ROLLBACK review', 'review', 'QA review', NULL, NULL,
   'https://zyxwvutsrqponmlkji98.supabase.co/functions/v1/publishing-image?article_id=0a647000-0000-4000-8000-0000000000a2&kind=hero',
   NULL),
  ('0a647000-0000-4000-8000-0000000000a3', '0a647000-0000-4000-8000-000000000001',
   NULL, 'QA ROLLBACK untouched', 'review', 'QA untouched', NULL, NULL,
   'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/entity-attachments/x/hero.webp',
   'https://abcdefghijklmnopqrst.supabase.co/functions/v1/publishing-image-v2?kind=inline');

-- Inserting the published article added it to the client's report; empty
-- the report so a re-add by the trigger would show.
DELETE FROM public.seo_monthly_updates WHERE client_id = '0a647000-0000-4000-8000-000000000003';

CREATE TEMP TABLE qa_before ON COMMIT DROP AS
  SELECT id, hero_image_url, inline_image_url FROM public.publishing_articles
  WHERE tenant_id = '0a647000-0000-4000-8000-000000000001';

-- 1. No project_url (CI, Preview branches, Staging today): nothing changes.
DELETE FROM vault.secrets WHERE name = 'project_url';
\ir ../migrations/20261126090000_publishing_image_urls_public_api.sql

DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM qa_before b JOIN public.publishing_articles a USING (id)
    WHERE (a.hero_image_url, a.inline_image_url) IS DISTINCT FROM (b.hero_image_url, b.inline_image_url)
  ) THEN
    RAISE EXCEPTION 'no project_url: image URLs must not change';
  END IF;
END
$test$;

-- 2. A supabase.co project_url is not a custom domain: nothing changes.
SELECT vault.create_secret('https://qrstuvwxyzabcdefghij.supabase.co/', 'project_url');
\ir ../migrations/20261126090000_publishing_image_urls_public_api.sql

DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM qa_before b JOIN public.publishing_articles a USING (id)
    WHERE (a.hero_image_url, a.inline_image_url) IS DISTINCT FROM (b.hero_image_url, b.inline_image_url)
  ) THEN
    RAISE EXCEPTION 'supabase.co project_url: image URLs must not change';
  END IF;
END
$test$;

-- 3. A custom domain: proxy URLs on any ref move to it, run twice.
DELETE FROM vault.secrets WHERE name = 'project_url';
SELECT vault.create_secret('https://api.qa-example.test/', 'project_url');
\ir ../migrations/20261126090000_publishing_image_urls_public_api.sql
\ir ../migrations/20261126090000_publishing_image_urls_public_api.sql

DO $test$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.publishing_articles WHERE id = '0a647000-0000-4000-8000-0000000000a1';
  IF v_row.hero_image_url IS DISTINCT FROM
       'https://api.qa-example.test/functions/v1/publishing-image?article_id=0a647000-0000-4000-8000-0000000000a1&kind=hero'
     OR v_row.inline_image_url IS DISTINCT FROM
       'https://api.qa-example.test/functions/v1/publishing-image?article_id=0a647000-0000-4000-8000-0000000000a1&kind=inline' THEN
    RAISE EXCEPTION 'custom domain: published article URLs are %, %', v_row.hero_image_url, v_row.inline_image_url;
  END IF;

  SELECT * INTO v_row FROM public.publishing_articles WHERE id = '0a647000-0000-4000-8000-0000000000a2';
  IF v_row.hero_image_url IS DISTINCT FROM
       'https://api.qa-example.test/functions/v1/publishing-image?article_id=0a647000-0000-4000-8000-0000000000a2&kind=hero'
     OR v_row.inline_image_url IS NOT NULL THEN
    RAISE EXCEPTION 'custom domain: review article URLs are %, %', v_row.hero_image_url, v_row.inline_image_url;
  END IF;

  IF EXISTS (
    SELECT 1 FROM qa_before b JOIN public.publishing_articles a USING (id)
    WHERE a.id = '0a647000-0000-4000-8000-0000000000a3'
      AND (a.hero_image_url, a.inline_image_url) IS DISTINCT FROM (b.hero_image_url, b.inline_image_url)
  ) THEN
    RAISE EXCEPTION 'custom domain: storage and other function URLs must not change';
  END IF;

  IF EXISTS (SELECT 1 FROM public.seo_monthly_updates WHERE client_id = '0a647000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'custom domain: the rewrite must not re-add the article to the client report';
  END IF;

  IF (SELECT tgenabled FROM pg_trigger
      WHERE tgrelid = 'public.publishing_articles'::regclass
        AND tgname = 'sync_published_article_monthly_work') IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'custom domain: sync_published_article_monthly_work must be enabled again';
  END IF;
END
$test$;

ROLLBACK;
