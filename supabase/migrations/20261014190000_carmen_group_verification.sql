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

-- Approved Manus groups keep their client on carmen_client_group_access.
-- The agency on that same row is who Carmen represents in the group.
alter table public.carmen_client_group_access
  add column if not exists agency_id uuid references public.agencies(id);

comment on column public.carmen_client_group_access.agency_id is
  'Agency this group belongs to. Carmen introduces herself as its digital marketing manager.';

update public.carmen_client_group_access as link
set agency_id = client.agency_id
from public.clients as client
where link.client_id = client.id
  and link.agency_id is null
  and client.agency_id is not null;
