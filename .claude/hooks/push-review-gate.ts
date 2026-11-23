#!/usr/bin/env node
/**
 * Pre-push review gate for Claude Code.
 *
 * CODING_STANDARDS.md step 3 asks for a self-review against the work
 * standard before every push. Lint and tests cannot check rules such as
 * "one source of truth", so this hook makes the step a gate: a `git push`
 * runs only once `/code-review` recorded a review of the branch's exact
 * changes from `origin/develop` (`node .claude/hooks/push-review-gate.ts
 * record`). A later code change needs a new review; a rebase that keeps the
 * changes keeps the record.
 *
 * Records live in the clone's git directory, never in the repository.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The hook payload Claude Code sends a PreToolUse command hook. */
type HookPayload = {
  cwd?: string;
  tool_input?: { command?: unknown };
};

/** A PreToolUse decision that stops the tool call and says why. */
type DenyDecision = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
};

const BASE = "origin/develop";

const DENY_REASON =
  "Push blocked until the work standard review is done (CODING_STANDARDS.md step 3): " +
  "run `/code-review origin/develop`, fix or answer every finding, then record it with " +
  "`node .claude/hooks/push-review-gate.ts record` and push again.";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main(process.argv[2]);
}

/** `record` saves a review of the current changes; otherwise it judges a hook payload. */
function main(command: string | undefined) {
  if (command === "record") {
    recordReview(process.cwd());
    return;
  }
  const decision = pushDecision(readPayload());
  if (decision) {
    process.stdout.write(JSON.stringify(decision));
  }
}

/**
 * The decision for one Bash call: a deny for a push whose changes have no
 * recorded review, null for anything else.
 */
export function pushDecision(payload: HookPayload | null): DenyDecision | null {
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || !pushesCommits(command)) {
    return null;
  }
  const cwd = payload?.cwd ?? process.cwd();
  try {
    const key = changesKey(cwd);
    return key === null || existsSync(recordPath(cwd, key))
      ? null
      : deny(DENY_REASON);
  } catch (error) {
    return deny(
      `Push blocked: the review gate could not read the branch (${String(error)}). ${DENY_REASON}`,
    );
  }
}

/** Records that the current changes from origin/develop were reviewed. */
export function recordReview(cwd: string): string {
  const key = changesKey(cwd);
  if (key === null) {
    console.log("No changes from origin/develop to record.");
    return "";
  }
  const path = recordPath(cwd, key);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${new Date().toISOString()}\n`);
  console.log(`Review recorded for these changes (${key.slice(0, 12)}).`);
  return path;
}

/** True for a `git push` that sends commits; deleting a remote branch sends none. */
export function pushesCommits(command: string): boolean {
  return command
    .split(/&&|\|\||;|\|/)
    .some(
      (part) =>
        /\bgit\s+(?:-C\s+\S+\s+)?push\b/.test(part) &&
        !/\s(?:--delete|-d)(?:\s|$)/.test(part) &&
        !/\s:\S+/.test(part),
    );
}

/**
 * A key for the branch's changes from its merge-base with origin/develop
 * (`git patch-id --stable`), so a rebase that keeps them keeps the key; null
 * when there are none.
 */
function changesKey(cwd: string): string | null {
  const base = git(cwd, ["merge-base", "HEAD", BASE]).trim();
  const diff = git(cwd, ["diff", base, "HEAD"]);
  if (diff.trim() === "") {
    return null;
  }
  const patchId = execFileSync("git", ["patch-id", "--stable"], {
    cwd,
    input: diff,
    encoding: "utf8",
  });
  return patchId.split(/\s+/)[0] || null;
}

/** Where the record of one set of changes lives in the clone's git directory. */
function recordPath(cwd: string, key: string): string {
  const gitDir = git(cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return join(gitDir.trim(), "claude-review", key);
}

/** Runs git in `cwd` and returns its output. */
function git(cwd: string, args: Array<string>): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** A PreToolUse deny with this reason. */
function deny(reason: string): DenyDecision {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

/** Parses the hook payload from stdin; null when it is not JSON. */
function readPayload(): HookPayload | null {
  try {
    return JSON.parse(readFileSync(0, "utf8")) as HookPayload;
  } catch {
    return null;
  }
}
