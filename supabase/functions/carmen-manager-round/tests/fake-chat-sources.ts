/**
 * A chat collector context, in-memory sources that record what was read and
 * asked, and threadFindings over them.
 */
import { RoundBudget } from "../budget.ts";
import type { FindingKind } from "../../_shared/manager-round/kinds.ts";
import type { ActivityRow } from "../collectors/chat/activity.ts";
import type { LiveChatFinding } from "../collectors/chat/gate.ts";
import type { CachedReview } from "../collectors/chat/review-cache.ts";
import { THREAD_KINDS } from "../collectors/chat/scope.ts";
import type { ChatSources } from "../collectors/chat/sources.ts";
import { threadFindings } from "../collectors/chat/thread-findings.ts";
import type { CollectorContext } from "../collectors/types.ts";
import { il, NOW, SETTINGS, STAFF_KEY } from "./chat-fixtures.ts";
import { TENANT } from "./fake-world.ts";
import { recordingClient } from "./recording-client.ts";

/** A scheduled run's context for the tenant, with `fields` laid over it. */
export function chatContext(
  fields: Partial<CollectorContext> = {},
): CollectorContext {
  return {
    tenantId: TENANT,
    settings: SETTINGS,
    loadRules: () => Promise.resolve(null),
    now: NOW,
    since: NOW,
    watermark: null,
    budget: RoundBudget.create(60_000, 10),
    clientIds: null,
    db: recordingClient().db,
    fixtures: null,
    dryRun: false,
    ...fields,
  };
}

export type FakeChatFields = {
  lines?: string[];
  live?: LiveChatFinding[];
  closed?: string[];
  /** Verdicts the review cache holds, by thread key. */
  reviews?: Map<string, CachedReview>;
  /** The model's JSON answer (no answer: the model is down). */
  answer?: string;
  /** The activity read stopped at its page cap. */
  capped?: boolean;
  /** The completed-call read stopped at its page cap. */
  callsCapped?: boolean;
};

/** Sources over `rows`; `asked` holds the prompts, `reads` the sources read. */
export function fakeChatSources(
  rows: ActivityRow[],
  fields: FakeChatFields = {},
) {
  const asked: string[] = [];
  const reads: string[] = [];
  const read = <T>(name: string, value: T) => {
    reads.push(name);
    return Promise.resolve(value);
  };
  const fake: ChatSources = {
    lines: () => read("lines", { ids: fields.lines ?? ["owner"], skipped: 0 }),
    activity: () => read("activity", { rows, complete: !fields.capped }),
    unlinked: () =>
      read("unlinked", [
        {
          group_id: "g9",
          group_chat_id: "999@g.us",
          group_name: "Acme שיווק",
          client_id: "c9",
          client_name: "Acme",
          message_count: 6,
          last_message_at: il("10:00"),
        },
      ]),
    staffKeys: () => read("staffKeys", new Set([STAFF_KEY])),
    calls: () => read("calls", { calls: [], complete: !fields.callsCapped }),
    live: () => read("live", fields.live ?? []),
    closed: () => read("closed", new Set(fields.closed ?? [])),
    chatLinkBase: () => Promise.resolve("https://app.test/t/acme/chat/"),
    classify: {
      cache: {
        load: () => Promise.resolve(new Map(fields.reviews ?? [])),
        save: () => Promise.resolve(),
      },
      ask: (prompt) => {
        asked.push(prompt);
        return Promise.resolve({ text: fields.answer ?? null, costUsd: 0 });
      },
    },
  };
  return { fake, asked, reads };
}

/** threadFindings over `rows` for `kinds` in the 7-day read, with the prompts the model was asked. */
export async function findInThreads(
  rows: ActivityRow[],
  fields: FakeChatFields = {},
  kinds: readonly FindingKind[] = THREAD_KINDS,
) {
  const sources = fakeChatSources(rows, fields);
  const query = {
    tenantId: TENANT,
    connectionIds: ["owner"],
    since: new Date(NOW.getTime() - 7 * 86_400_000),
    clientIds: null,
  };
  const found = await threadFindings(chatContext(), sources.fake, query, kinds);
  return { ...found, asked: sources.asked };
}
