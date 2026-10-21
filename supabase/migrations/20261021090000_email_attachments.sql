-- Email templates/broadcasts can carry attachments. Files live in Storage
-- (broadcast-media/<tenant>/attachments/…); each item is
-- {name, path, url, size, content_type} and is sent to Resend by URL.
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
