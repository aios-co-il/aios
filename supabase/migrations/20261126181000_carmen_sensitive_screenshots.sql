-- Per-user Carmen permission (AIO-656): pictures of sensitive pages.
--
-- Carmen may take a picture of the user's browser tab (browser_screenshot)
-- and send it to the AI model. On an ordinary page that follows the device
-- contract. On the act floor (mail, messaging, banks, payments) or a page
-- with a password or payment field, a picture is allowed only for a user whose
-- sensitive_screenshots is true on their Carmen permissions row, and then the
-- extension asks on a card every time (deviceCardRule in
-- supabase/functions/_shared/carmen/device/card-rule.ts). Clicking and typing
-- there stay refused whatever this says.
--
-- Off by default, and off for a user without a row: unlike the other columns
-- of this table, a missing row does not mean unrestricted here. The
-- organization's manager switches it on in Carmen's permissions screen
-- (הרשאות). The table's existing policies govern the column: managers of the
-- org (owner, agency owner, team manager, super admin) write it, and members
-- of the org read it; a member cannot switch it on for themselves.
-- carmen-device-action and run-ai-agent read it with the service role for the
-- signed-in user and the org's active Carmen, never from a request.
--
-- Triggers fired: none (the table has no triggers). Existing rows get false.
-- Safe to re-run.

ALTER TABLE public.carmen_command_center_access
  ADD COLUMN IF NOT EXISTS sensitive_screenshots boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.carmen_command_center_access.sensitive_screenshots IS
  'true = Carmen may take a picture of a mail, messaging, bank or payment page, or a page with a password or payment field, after a card each time (AIO-656). Off by default.';
