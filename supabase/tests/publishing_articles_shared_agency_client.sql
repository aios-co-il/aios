-- Staging only: synthetic articles and agency shares, and a full rollback.
-- An article may name another tenant's client only through a read_write share
-- of that client's agency (20261026095100).
BEGIN;
DO $test$
DECLARE
  article_tenant uuid; own_client uuid;
  shared_client uuid; shared_agency uuid; source_tenant uuid;
  share_id uuid; own_article uuid; shared_article uuid;
BEGIN
  SELECT own.tenant_id, own.id, other.id, other.agency_id, other.tenant_id
    INTO article_tenant, own_client, shared_client, shared_agency, source_tenant
  FROM public.clients own
  JOIN public.clients other ON other.tenant_id <> own.tenant_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agency_tenant_access ata
    WHERE ata.agency_id = other.agency_id
      AND ata.accessing_tenant_id = own.tenant_id
  )
  LIMIT 1;
  IF shared_client IS NULL THEN
    RAISE EXCEPTION 'Requires two tenants with clients and no share between them';
  END IF;

  INSERT INTO public.publishing_articles (tenant_id, client_id, primary_keyword, status)
  VALUES (article_tenant, own_client, 'QA ROLLBACK own client', 'draft')
  RETURNING id INTO own_article;

  BEGIN
    INSERT INTO public.publishing_articles (tenant_id, client_id, primary_keyword, status)
    VALUES (article_tenant, shared_client, 'Must be denied', 'draft');
    RAISE EXCEPTION 'An unshared client of another tenant can be named';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level, notes)
  VALUES (source_tenant, shared_agency, article_tenant, 'read_only', 'QA ROLLBACK')
  RETURNING id INTO share_id;
  BEGIN
    INSERT INTO public.publishing_articles (tenant_id, client_id, primary_keyword, status)
    VALUES (article_tenant, shared_client, 'Must be denied', 'draft');
    RAISE EXCEPTION 'A read_only share allows writing an article';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.publishing_articles SET client_id = shared_client WHERE id = own_article;
    RAISE EXCEPTION 'A read_only share allows moving an article to the client';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.agency_tenant_access SET access_level = NULL WHERE id = share_id;
  BEGIN
    INSERT INTO public.publishing_articles (tenant_id, client_id, primary_keyword, status)
    VALUES (article_tenant, shared_client, 'Must be denied', 'draft');
    RAISE EXCEPTION 'A share without an access level allows writing an article';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.agency_tenant_access SET access_level = 'read_write' WHERE id = share_id;
  INSERT INTO public.publishing_articles (tenant_id, client_id, primary_keyword, status)
  VALUES (article_tenant, shared_client, 'QA ROLLBACK shared client', 'draft')
  RETURNING id INTO shared_article;
  IF shared_article IS NULL THEN
    RAISE EXCEPTION 'A read_write share does not allow writing an article';
  END IF;
  UPDATE public.publishing_articles SET client_id = shared_client WHERE id = own_article;
END;
$test$;
SELECT 'Own-tenant client, unshared, read_only, null and read_write agency shares passed' AS result;
ROLLBACK;
