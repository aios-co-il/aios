-- Marks each org's Carmen agent (AIO-592), so code finds it without matching its name and an org
-- can rename its assistant (e.g. to "מיני מי") without losing it.
--
-- Backfill: the one active agent per tenant whose name is a Carmen variant ("carmen" / "כרמן").
-- Read-only counts before this migration: Production has exactly one such agent in each of its two
-- tenants that have one, so the backfill touches those two rows; a tenant with several picks the
-- oldest. No trigger on ai_agents reacts to this column. Lookups keep the name match as a fallback
-- for agents created later without the flag. Safe to re-run.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS is_carmen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_agents.is_carmen IS
  'True for the org''s Carmen agent (one per tenant), whatever its name or display name (AIO-592).';

-- One Carmen per org.
CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_one_carmen_per_tenant
  ON public.ai_agents (tenant_id)
  WHERE is_carmen;

-- Flags the oldest active name-matched agent in each tenant that has no flagged agent yet.
UPDATE public.ai_agents AS a
SET is_carmen = true
FROM (
  SELECT DISTINCT ON (tenant_id) id
  FROM public.ai_agents
  WHERE active IS TRUE
    AND (name ILIKE '%carmen%' OR name LIKE '%כרמן%')
    AND tenant_id NOT IN (SELECT tenant_id FROM public.ai_agents WHERE is_carmen)
  ORDER BY tenant_id, created_at ASC NULLS LAST, id
) AS pick
WHERE a.id = pick.id;
