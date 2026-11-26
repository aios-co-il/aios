-- Client update reads follow client visibility only (AIO-TBD).
--
-- The baseline policy "Users can view client updates in their tenant" let any
-- member of the writing org read every entry, including entries on clients
-- they cannot see (a campaigner restricted to assigned clients). Permissive
-- policies are OR-ed, so it widened the client-scoped policy that
-- 20261030092000_client_card_provenance.sql added. Dropping it leaves that
-- policy as the only read rule: whoever can see the client (under the clients
-- policies, super admins included) reads every entry on its card.
--
-- No data changes. Service-role reads (Carmen, edge functions) and SECURITY
-- DEFINER functions and triggers bypass RLS and are unaffected.

DROP POLICY IF EXISTS "Users can view client updates in their tenant" ON public.client_updates;
