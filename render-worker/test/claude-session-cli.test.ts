import { describe, expect, test } from "vitest";
import { cloudSessionSender } from "../src/claude-session/cli.ts";
import type { RunCommand } from "../src/claude-session/cli.ts";

/** A CLI that prints the given output, recording how it was called. */
function fakeCli(answer: Partial<Awaited<ReturnType<RunCommand>>>) {
  const calls: Array<{ file: string; args: Array<string> }> = [];
  async function run(
    ...[file, args]: Parameters<RunCommand>
  ): ReturnType<RunCommand> {
    calls.push({ file, args });
    return { stdout: "", stderr: "", failure: null, ...answer };
  }
  return { run, calls };
}

const message = { sessionId: "session_01AbC", prompt: "[AIOS] שלום" };

describe("cloudSessionSender", () => {
  test("sends the prompt to the session with the Claude CLI", async () => {
    const { run, calls } = fakeCli({
      stdout:
        "Sent to cloud session.\nSession ID: session_01AbC\nView: https://claude.ai/code/session_01AbC\n",
    });
    await cloudSessionSender(run)(message);
    expect(calls).toEqual([
      {
        file: "claude",
        args: ["-p", "[AIOS] שלום", "--cloud", "session_01AbC"],
      },
    ]);
  });

  test("an error the CLI prints counts as not sent, even with exit code 0", async () => {
    const { run } = fakeCli({
      stdout:
        "Error: failed to send message to cloud session session_01AbC: Session expired. Please run /login to sign in again.",
    });
    await expect(cloudSessionSender(run)(message)).rejects.toThrow(
      /Session expired/,
    );
  });

  test("a failed or timed-out run counts as not sent", async () => {
    const { run } = fakeCli({ failure: "Command failed: spawn claude ENOENT" });
    await expect(cloudSessionSender(run)(message)).rejects.toThrow(/ENOENT/);
  });

  test("output the worker does not recognise counts as not sent", async () => {
    const { run } = fakeCli({ stdout: "" });
    await expect(cloudSessionSender(run)(message)).rejects.toThrow(
      /printed nothing/,
    );
  });

  test("values that would read as CLI options never reach the CLI", async () => {
    const { run, calls } = fakeCli({ stdout: "Sent to cloud session." });
    const send = cloudSessionSender(run);
    await expect(
      send({ ...message, sessionId: "--dangerously-skip-permissions" }),
    ).rejects.toThrow(/session id/);
    await expect(send({ ...message, prompt: "--help" })).rejects.toThrow(
      /dash/,
    );
    await expect(send({ ...message, prompt: "  " })).rejects.toThrow(/empty/);
    expect(calls).toEqual([]);
  });
});
