// Row shapes for backfill selects that name columns missing from the generated
// schema (tasks.description; chat_messages.message/body/text), so the typed
// client cannot infer them. Fields stay unknown and are read defensively.

export type LegacyTaskRow = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  status?: unknown;
  due_date?: unknown;
  created_at?: unknown;
  client_id?: unknown;
  campaigner_id?: unknown;
  assigned_to_campaigner_id?: unknown;
};

export type LegacyMessageRow = {
  id?: unknown;
  message?: unknown;
  body?: unknown;
  text?: unknown;
  provider?: unknown;
  direction?: unknown;
  sender_name?: unknown;
  sender_phone?: unknown;
  client_id?: unknown;
  lead_id?: unknown;
  created_at?: unknown;
};

export function objectOrEmpty(raw: unknown): object {
  return typeof raw === "object" && raw !== null ? raw : {};
}
