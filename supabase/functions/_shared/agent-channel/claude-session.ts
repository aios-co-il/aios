/**
 * Claude Direct follow-ups into the cloud session a conversation already has (AIO-600).
 *
 * The routine's fire API starts a new session on every call. A follow-up is instead queued in
 * claude_session_messages, and the claude-session worker (render-worker/src/claude-session),
 * signed in to the Claude account, sends it into the open session. The send waits for the
 * worker's verdict, so a follow-up the worker did not deliver starts a new session at once.
 */
/** How long a queued follow-up waits for a worker to claim it before a new session starts. */
export const CLAIM_WAIT_MS = 8_000;
/** How long a claimed follow-up may take; longer than the worker's own send timeout. */
export const SEND_WAIT_MS = 20_000;
const POLL_MS = 500;
/** A command-line argument holds about 128 KB; larger prompts start a new session. */
const MAX_PROMPT_BYTES = 100_000;
const DEFAULT_IDLE_HOURS = 24;
const CLOUD_SESSION_ID = /^session_[A-Za-z0-9]+$/;

type Env = Record<string, string | undefined>;

/** Whether this environment runs a claude-session worker (edge secret CLAUDE_SESSION_WORKER=1). */
export function continuesSessions(env: Env): boolean {
  return env.CLAUDE_SESSION_WORKER === "1";
}

/** How long after its last message a cloud session still takes follow-ups. */
export function sessionIdleLimitMs(env: Env): number {
  const hours = Number(env.CLAUDE_SESSION_IDLE_HOURS);
  return (hours > 0 ? hours : DEFAULT_IDLE_HOURS) * 3_600_000;
}

/**
 * The cloud session a routine fire opened, as the id the Claude CLI takes (session_…).
 * The fire answers with a cse_… id and a claude.ai/code/<id> URL.
 */
export function cloudSessionIdOf(fire: {
  claude_code_session_id?: unknown;
  claude_code_session_url?: unknown;
}): string | null {
  const raw =
    typeof fire.claude_code_session_id === "string" &&
    fire.claude_code_session_id
      ? fire.claude_code_session_id
      : lastPathSegment(fire.claude_code_session_url);
  const id = raw.replace(/^cse_/, "session_");
  return CLOUD_SESSION_ID.test(id) ? id : null;
}

/**
 * The session a launch leaves open for the conversation's next message. A one-off prompt (a
 * parliament seat, a meeting summary) leaves none: its session never saw the conversation, and
 * a follow-up sent there, without pasted history, would lose the thread.
 */
export function sessionLeftOpen(
  fire: Parameters<typeof cloudSessionIdOf>[0],
  launch: { oneOff: boolean },
): string | null {
  return launch.oneOff ? null : cloudSessionIdOf(fire);
}

/** The last path segment of a URL, "" when the value is not a URL. */
function lastPathSegment(url: unknown): string {
  if (typeof url !== "string" || !URL.canParse(url)) {
    return "";
  }
  return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
}

/** Whether a prompt fits the worker's command line. */
export function fitsFollowup(prompt: string): boolean {
  return new TextEncoder().encode(prompt).length <= MAX_PROMPT_BYTES;
}

export type MessageStatus =
  "queued" | "sending" | "sent" | "failed" | "cancelled";

/** The queue operations a follow-up needs; faked in tests. */
export type FollowupStore = {
  /** Queues the prompt and returns the row id. */
  queue(prompt: string): Promise<string>;
  status(id: string): Promise<MessageStatus | null>;
  /** Cancels a row no worker claimed. False when a worker claimed it first. */
  cancelQueued(id: string): Promise<boolean>;
};

/** A worker took the follow-up and gave no verdict in time: it may or may not have been sent. */
export class UnconfirmedFollowupError extends Error {
  constructor(id: string) {
    super(
      `Claude did not confirm follow-up ${id}. It was not sent again, to avoid a second delivery; resend it if no answer arrives.`,
    );
    this.name = "UnconfirmedFollowupError";
  }
}

/**
 * Queues a follow-up and waits for the worker's verdict. True when the worker sent it into the
 * open session. False only when it is certain it was not sent (no worker claimed it, or the
 * worker reported a failed send), so the caller may start a new session without a second
 * delivery. A claimed follow-up with no verdict throws UnconfirmedFollowupError instead: the
 * worker may have sent it, and only the worker can say.
 */
export async function deliverFollowup(args: {
  store: FollowupStore;
  prompt: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
}): Promise<boolean> {
  const now = args.now ?? Date.now;
  const sleep =
    args.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const id = await args.store.queue(args.prompt);
  const queuedAt = now();

  while (true) {
    const status = await args.store.status(id);
    if (status === "sent") {
      return true;
    }
    const waited = now() - queuedAt;
    const pastDeadline = waited >= CLAIM_WAIT_MS + SEND_WAIT_MS;
    // A worker reports a failed send well inside the deadline. A "failed" first seen after it
    // is the claim function closing a claim that got no verdict, which proves nothing about
    // delivery: the worker may have sent the prompt and failed to say so.
    if (status === "failed" && pastDeadline) {
      throw new UnconfirmedFollowupError(id);
    }
    if (status !== "queued" && status !== "sending") {
      return false;
    }
    if (status === "queued" && waited >= CLAIM_WAIT_MS) {
      if (await args.store.cancelQueued(id)) {
        return false;
      }
    } else if (pastDeadline) {
      throw new UnconfirmedFollowupError(id);
    } else {
      await sleep(POLL_MS);
    }
  }
}
