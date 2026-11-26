// The Supabase stand-in for chat bar tests: the conversation list and one
// conversation's messages. The user's picks row is the choices tests' own
// stand-in; every other table reads as empty.
import { fakeSupabase } from "./choices/carmenChoiceQueries.test-fixture";

interface ConversationRow {
  id: string;
  title: string;
  updated_at: string;
  status: string;
  routing_mode: string;
  brain_route_id: string;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  channel: string;
}

export const chat = {
  conversations: [] as Array<ConversationRow>,
  messages: [] as Array<MessageRow>,
  /** Holds the conversation list until the test releases it. */
  conversationsGate: Promise.resolve(),
};

/** No conversations, answered at once. */
export function resetChat(): void {
  chat.conversations = [];
  chat.messages = [];
  chat.conversationsGate = Promise.resolve();
}

const feed = { on: () => feed, subscribe: () => feed };

export const fakeChatSupabase = {
  from: (table: string) =>
    table === "carmen_user_choices" ? fakeSupabase.from() : tableQuery(table),
  channel: () => feed,
  removeChannel: async () => {},
  auth: {
    getSession: async () => ({
      data: { session: { access_token: "test-token" } },
    }),
    getUser: async () => ({ data: { user: { id: "user-1" } } }),
  },
};

/**
 * Any query on a table: each step returns the same query, and awaiting it
 * answers the table's rows.
 */
function tableQuery(table: string): object {
  const query: object = new Proxy(() => query, {
    get: (_target, step) =>
      step === "then"
        ? (answered: (rows: unknown) => unknown) =>
            readTable(table).then(answered)
        : () => query,
  });
  return query;
}

/** The rows of one table, as PostgREST answers them. */
async function readTable(table: string) {
  if (table === "ai_conversations") {
    await chat.conversationsGate;
    return { data: chat.conversations, error: null };
  }
  if (table === "ai_conversation_messages") {
    return { data: chat.messages, error: null };
  }
  return { data: null, error: null };
}
