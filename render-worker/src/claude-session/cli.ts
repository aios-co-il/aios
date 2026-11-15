import { execFile } from "node:child_process";

/** Shorter than the 20 s the edge function waits for a claimed message. */
const SEND_TIMEOUT_MS = 15_000;
const SESSION_ID = /^session_[A-Za-z0-9]+$/;
/** The line the CLI prints once the session has the message. */
const SENT = "Sent to cloud session";

/** Sends one message into a cloud session; rejects when it was not sent. */
export type SendToCloudSession = (args: {
  sessionId: string;
  prompt: string;
}) => Promise<void>;

/** Runs a command and resolves with what it printed, whatever its exit code. */
export type RunCommand = (
  file: string,
  args: Array<string>,
  timeoutMs: number,
) => Promise<{ stdout: string; stderr: string; failure: string | null }>;

/**
 * Sends a follow-up with `claude -p <prompt> --cloud <session>`. The CLI only hands the message
 * over and exits; the session answers on its own. Anything but the CLI's "sent" line counts as
 * not sent, so an answer the worker cannot read starts a new session instead of losing the message.
 */
export function cloudSessionSender(
  run: RunCommand = runCommand,
): SendToCloudSession {
  return async ({ sessionId, prompt }) => {
    // Both values become command-line arguments; neither may read as an option.
    if (!SESSION_ID.test(sessionId)) {
      throw new Error("not a cloud session id");
    }
    if (!prompt.trim() || prompt.startsWith("-")) {
      throw new Error("the prompt is empty or starts with a dash");
    }
    const { stdout, stderr, failure } = await run(
      "claude",
      ["-p", prompt, "--cloud", sessionId],
      SEND_TIMEOUT_MS,
    );
    if (failure || !stdout.includes(SENT)) {
      throw new Error(
        [failure, stderr.trim(), stdout.trim()].filter(Boolean).join(" | ") ||
          "the CLI printed nothing",
      );
    }
  };
}

export const sendToCloudSession: SendToCloudSession = cloudSessionSender();

/** execFile as a promise that keeps the output of a failed or timed-out run. */
function runCommand(
  file: string,
  args: Array<string>,
  timeoutMs: number,
): ReturnType<RunCommand> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) =>
        resolve({ stdout, stderr, failure: error ? error.message : null }),
    );
  });
}
