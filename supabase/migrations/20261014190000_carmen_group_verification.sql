-- Extends the existing activation handshake into an approved Manus group.
-- Approved phones stay on carmen_whatsapp_identities / carmen_access_policies.
-- Approved groups stay on carmen_access_policies.allowed_group_ids.
-- The one-time code stays on wa_pending_activations. No second roster.

alter table public.wa_pending_activations
  add column if not exists group_chat_id text;

alter table public.carmen_whatsapp_identities
  add column if not exists relationship_note text;

comment on column public.carmen_whatsapp_identities.relationship_note is
  'Tone and relationship instructions for this approved person. Tone only; it does not grant access.';

comment on column public.wa_pending_activations.group_chat_id is
  'When set, the code must be typed in this Manus group. Null keeps the existing private reply.';

create index if not exists idx_wa_pending_activations_group
  on public.wa_pending_activations (tenant_id, group_chat_id, status)
  where group_chat_id is not null;
