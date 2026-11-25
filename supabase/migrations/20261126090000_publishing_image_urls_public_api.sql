-- PBN magazine articles stored their image proxy URLs on the project's
-- supabase.co address, which changes when the project moves region (AIO-647).
-- New articles use PUBLIC_API_URL (AIO-645); this rewrites the stored ones.
--
-- Matches hero_image_url / inline_image_url that start with
-- `https://<20-char ref>.supabase.co/functions/v1/publishing-image`, any ref,
-- and replaces only that origin with the origin of this database's Vault
-- `project_url` (AIO-192), so each environment points at its own API.
-- It runs only when `project_url` is a custom domain: with no secret
-- (Staging today, Preview branches, CI) or a supabase.co address it changes
-- nothing and raises a notice, so Staging never gets Production's domain.
-- Rerunning matches nothing, since rewritten rows no longer name supabase.co.
--
-- sync_published_article_monthly_work is off for this update: it fires on any
-- UPDATE and would re-add each published article to its client's monthly SEO
-- report, though only the image address changed.
ALTER TABLE public.publishing_articles DISABLE TRIGGER sync_published_article_monthly_work;

DO $$
DECLARE
  c_old_origin constant text := '^https://[a-z0-9]{20}\.supabase\.co(/functions/v1/publishing-image([?#].*)?)$';
  v_project_url text;
  v_origin text;
  v_updated integer;
BEGIN
  SELECT decrypted_secret INTO v_project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;

  v_origin := substring(coalesce(v_project_url, '') FROM '^https://[^/?#\s]+');

  IF v_origin IS NULL OR v_origin ~* '\.supabase\.co$' THEN
    RAISE NOTICE 'AIO-647: project_url is not a custom domain (%); publishing image URLs unchanged',
      coalesce(v_origin, 'missing');
    RETURN;
  END IF;

  UPDATE public.publishing_articles
  SET hero_image_url = regexp_replace(hero_image_url, c_old_origin, v_origin || '\1'),
      inline_image_url = regexp_replace(inline_image_url, c_old_origin, v_origin || '\1')
  WHERE hero_image_url ~ c_old_origin
     OR inline_image_url ~ c_old_origin;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'AIO-647: % publishing articles now load images from %', v_updated, v_origin;
END
$$;

ALTER TABLE public.publishing_articles ENABLE TRIGGER sync_published_article_monthly_work;
