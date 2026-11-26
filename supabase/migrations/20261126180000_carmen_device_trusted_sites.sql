-- Carmen device trusted sites (AIO-656): the sites a user trusted for one
-- conversation from a click or typing card in the Chrome extension's panel.
--
-- On a click or typing card the user may tick "trust this site for this
-- conversation". The panel then completes the step with that origin and
-- carmen-device-action records one row for the step's own user, org and
-- conversation and that exact origin (scheme, host and port), with the service
-- role. When the panel later claims a click or a type in the same conversation,
-- the function answers with the origin it may run on without a card: a trusted
-- origin, and only while every page result of the run came from it. The panel
-- still asks on a page with a password or payment field, on the act floor and
-- for every navigation (deviceCardRule in
-- supabase/functions/_shared/carmen/device/card-rule.ts).
--
-- A signed-in user reads their own rows, in an org they belong to (a super
-- admin only in the org they act in, as carmen_device_actions), so the chat can
-- show which sites are trusted, and deletes them to revoke the trust. Signed-in
-- users hold no INSERT or UPDATE: a page, the framed site's chat or the model
-- has no way to write a trust; only the edge function does, from a completed
-- step that ran after a card.
--
-- A row goes with its org, its user or its conversation (ON DELETE CASCADE):
-- the trust ends with the conversation.
--
-- Triggers fired: none. No existing row or table changes. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.carmen_device_trusted_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  -- One exact https origin as URL.origin writes it: no path, credentials, query or fragment.
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carmen_device_trusted_sites_origin_chk
    CHECK (char_length(origin) <= 2048 AND origin ~ '^https://[^/?#@[:space:]]+$'),
  CONSTRAINT carmen_device_trusted_sites_key
    UNIQUE (tenant_id, user_id, conversation_id, origin)
);

COMMENT ON TABLE public.carmen_device_trusted_sites IS
  'Sites a user trusted for one conversation from a click or typing card; written by carmen-device-action only (AIO-656).';

-- Deleting a user or a conversation finds its rows without scanning the table.
CREATE INDEX IF NOT EXISTS idx_carmen_device_trusted_sites_user
  ON public.carmen_device_trusted_sites (user_id);
CREATE INDEX IF NOT EXISTS idx_carmen_device_trusted_sites_conversation
  ON public.carmen_device_trusted_sites (conversation_id);

ALTER TABLE public.carmen_device_trusted_sites ENABLE ROW LEVEL SECURITY;

-- Each user reads their own trusted sites in an org they belong to; a super admin their own in the org they act in.
DROP POLICY IF EXISTS carmen_device_trusted_sites_select ON public.carmen_device_trusted_sites;
CREATE POLICY carmen_device_trusted_sites_select
  ON public.carmen_device_trusted_sites
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.user_is_tenant_member(tenant_id)
      OR (
        public.is_super_admin((SELECT auth.uid()))
        AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      )
    )
  );

-- Each user revokes their own trusted sites, under the same rule as the read.
DROP POLICY IF EXISTS carmen_device_trusted_sites_delete ON public.carmen_device_trusted_sites;
CREATE POLICY carmen_device_trusted_sites_delete
  ON public.carmen_device_trusted_sites
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.user_is_tenant_member(tenant_id)
      OR (
        public.is_super_admin((SELECT auth.uid()))
        AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      )
    )
  );

-- authenticated is revoked first: the default privileges of the public schema give it every command.
REVOKE ALL ON TABLE public.carmen_device_trusted_sites FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.carmen_device_trusted_sites TO authenticated;
GRANT ALL ON public.carmen_device_trusted_sites TO service_role;
