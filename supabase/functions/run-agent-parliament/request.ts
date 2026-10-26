export type HistoryMessage = { role: string; content: string };

/** Request body fields; values are unvalidated client JSON. */
export type ParliamentRequest = {
  tenant_id?: unknown;
  action?: unknown;
  conversation_id?: unknown;
  provider?: unknown;
  content?: unknown;
  question?: unknown;
  goal?: unknown;
  brain_route_id?: unknown;
  idempotency_key?: unknown;
  conversation_history?: unknown;
};

/** Field view of a parsed JSON body; a non-object body reads as having no fields. */
export function readParliamentRequest(raw: unknown): ParliamentRequest {
  if (typeof raw !== "object" || raw === null) return {};
  return {
    tenant_id: "tenant_id" in raw ? raw.tenant_id : undefined,
    action: "action" in raw ? raw.action : undefined,
    conversation_id: "conversation_id" in raw ? raw.conversation_id : undefined,
    provider: "provider" in raw ? raw.provider : undefined,
    content: "content" in raw ? raw.content : undefined,
    question: "question" in raw ? raw.question : undefined,
    goal: "goal" in raw ? raw.goal : undefined,
    brain_route_id: "brain_route_id" in raw ? raw.brain_route_id : undefined,
    idempotency_key: "idempotency_key" in raw ? raw.idempotency_key : undefined,
    conversation_history:
      "conversation_history" in raw ? raw.conversation_history : undefined,
  };
}

function isHistoryMessage(value: unknown): value is HistoryMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    typeof value.role === "string" &&
    "content" in value &&
    typeof value.content === "string"
  );
}

/** conversation_history entries shaped { role, content } as strings; anything else is dropped. */
export function readHistory(value: unknown): HistoryMessage[] {
  return Array.isArray(value) ? value.filter(isHistoryMessage) : [];
}
