-- Email templates/broadcasts can carry raw, ready-made HTML (full document
-- with <style>, tables). html_mode=true sends it as-is (scripts stripped)
-- instead of wrapping rich-editor HTML in the default container.
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS html_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS html_mode boolean NOT NULL DEFAULT false;
