-- Reports of a client that is not active (paused, ended, inactive) stop
-- syncing: their crm_tables are switched off (campaign_active = false), the
-- flag every scheduled sync now skips. David, 2026-11-11: "a client that is
-- not active, its report is inactive and pulls no data".

-- Switches a client's report tables off when the client stops being active.
-- Tables are matched by client id alone: a shared agency's report table can
-- sit in another tenant than the client row, and the client row decides.
-- Reactivating a client leaves its tables as they are, so a table someone
-- switched off by hand is not switched back on.
CREATE OR REPLACE FUNCTION public.deactivate_reports_of_inactive_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('paused', 'ended', 'inactive')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('paused', 'ended', 'inactive')) THEN
    UPDATE public.crm_tables
    SET campaign_active = false
    WHERE client_id = NEW.id
      AND campaign_active;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_reports_of_inactive_client() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_deactivate_reports_of_inactive_client ON public.clients;
CREATE TRIGGER trigger_deactivate_reports_of_inactive_client
AFTER UPDATE OF status ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.deactivate_reports_of_inactive_client();

-- Data fix: the report tables of clients that are already not active and
-- still switched on (27 in Production on 2026-11-11, e.g. מני גרינבאום).
UPDATE public.crm_tables AS t
SET campaign_active = false
FROM public.clients AS c
WHERE c.id = t.client_id
  AND c.status IN ('paused', 'ended', 'inactive')
  AND t.campaign_active;
