-- Marks each org's Carmen agent (AIO-592), so code finds it without matching its name and an org
-- can rename its assistant (e.g. to "מיני מי") without losing it.
--
-- Backfill: in each tenant without a flagged agent, the Carmen-named agent ("carmen" / "כרמן"),
-- the active one first, else the oldest. Read-only counts on Production before this migration:
-- 2 tenants have Carmen-named agents, with exactly 1 such agent each (both active), so the
-- backfill flags those 2 rows. The new trigger below fires only on INSERT, so the backfill's
-- UPDATE fires no trigger. Safe to re-run.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS is_carmen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_agents.is_carmen IS
  'True for the org''s Carmen agent (one per tenant), whatever its name or display name (AIO-592).';

-- One Carmen per org.
CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_one_carmen_per_tenant
  ON public.ai_agents (tenant_id)
  WHERE is_carmen;

-- Flags the best Carmen-named agent in each tenant that has no flagged agent yet.
UPDATE public.ai_agents AS a
SET is_carmen = true
FROM (
  SELECT DISTINCT ON (c.tenant_id) c.id
  FROM public.ai_agents AS c
  WHERE (c.name ILIKE '%carmen%' OR c.name LIKE '%כרמן%')
    AND NOT EXISTS (
      SELECT 1 FROM public.ai_agents AS f WHERE f.tenant_id = c.tenant_id AND f.is_carmen
    )
  ORDER BY c.tenant_id, (c.active IS TRUE) DESC, c.created_at ASC NULLS LAST, c.id
) AS pick
WHERE a.id = pick.id;

-- Flags a new org's first Carmen-named agent, so every path that creates one (tenant bootstrap,
-- seeds, the agent editor) marks it without each caller knowing about the flag.
CREATE OR REPLACE FUNCTION public.ai_agents_flag_first_carmen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NOT NEW.is_carmen
     AND (NEW.name ILIKE '%carmen%' OR NEW.name LIKE '%כרמן%')
     AND NOT EXISTS (
       SELECT 1 FROM public.ai_agents WHERE tenant_id = NEW.tenant_id AND is_carmen
     ) THEN
    NEW.is_carmen := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_agents_flag_first_carmen ON public.ai_agents;
CREATE TRIGGER ai_agents_flag_first_carmen
  BEFORE INSERT ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.ai_agents_flag_first_carmen();
