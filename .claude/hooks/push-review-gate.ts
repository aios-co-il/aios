#!/usr/bin/env node
/**
 * Pre-push review gate for Claude Code.
 *
 * CODING_STANDARDS.md step 3 asks for a self-review against the work
 * standard before every push. Lint and tests cannot check rules such as
 * "one source of truth", so this hook makes the step a gate: a `git push`
 * runs only once `/code-review` recorded a review of the branch's changes
 * from `origin/develop` (`node .claude/hooks/push-review-gate.ts record`).
 * The record is keyed on the changed lines alone, so a rebase or merge from
 * develop that leaves them as they were keeps it.
 *
 * `git push --no-verify` skips the gate, as it skips git's own pre-push
 * hooks; docs/agents/autonomic-issues.md names the one case that uses it.
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
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gatedPushes } from "./push-command.ts";

/** A PreToolUse decision that stops the tool call and says why. */
type DenyDecision = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
};

const BASE = "origin/develop";

const REVIEW_STEPS =
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
    console.log(recordReview(process.cwd()));
    return;
  }
  const decision = pushDecision(readFileSync(0, "utf8"));
  if (decision) {
    process.stdout.write(JSON.stringify(decision));
  }
}

/**
 * The decision for one Bash call, from the raw hook payload: a deny for a
 * push whose changes have no recorded review, null for anything else. A
 * payload it cannot read is denied when it mentions a push.
 */
export function pushDecision(rawPayload: string): DenyDecision | null {
  const payload = parsePayload(rawPayload);
  if (!payload) {
    return /\bgit\b.*\bpush\b/.test(rawPayload)
      ? deny(
          `Push blocked: the review gate could not read this call. ${REVIEW_STEPS}`,
        )
      : null;
  }
  for (const push of gatedPushes(payload.command, payload.cwd)) {
    const reason = unreviewedReason(push.cwd);
    if (reason) {
      return deny(reason);
    }
  }
  return null;
}

/** Records that the current changes from origin/develop were reviewed; says what it did. */
export function recordReview(cwd: string): string {
  const key = changesKey(cwd);
  if (key === null) {
    return "No changes from origin/develop to record.";
  }
  const path = recordPath(cwd, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${new Date().toISOString()}\n`);
  return `Review recorded for these changes (${key.slice(0, 12)}).`;
}

/** Why a push from this directory is blocked; null when its changes were reviewed. */
function unreviewedReason(cwd: string): string | null {
  if (!hasBase(cwd)) {
    return `Push blocked: ${BASE} is missing in ${cwd}, so the review gate cannot see the branch's changes. Run \`git fetch origin develop\`, then ${REVIEW_STEPS}`;
  }
  try {
    const key = changesKey(cwd);
    return key === null || existsSync(recordPath(cwd, key))
      ? null
      : `Push blocked until the work standard review is done (CODING_STANDARDS.md step 3): ${REVIEW_STEPS}`;
  } catch (error) {
    return `Push blocked: the review gate could not read the branch in ${cwd} (${String(error)}). ${REVIEW_STEPS}`;
  }
}

/** Whether origin/develop exists in this clone. */
function hasBase(cwd: string): boolean {
  try {
    git(cwd, ["rev-parse", "--verify", "--quiet", `${BASE}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * A key for the branch's changed lines since its merge-base with
 * origin/develop (`git patch-id --stable` over a diff without context
 * lines); null when nothing changed.
 */
function changesKey(cwd: string): string | null {
  const base = git(cwd, ["merge-base", "HEAD", BASE]).trim();
  const diff = git(cwd, ["diff", "--unified=0", base, "HEAD"]);
  if (diff.trim() === "") {
    return null;
  }
  const patchId = git(cwd, ["patch-id", "--stable"], diff);
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

/** Runs git in `cwd`, with `input` on stdin, and returns its output. */
function git(cwd: string, args: Array<string>, input?: string): string {
  return execFileSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** The command and directory of a Bash hook payload; null when it has none. */
function parsePayload(raw: string): { command: string; cwd: string } | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  const input = fieldOf(payload, "tool_input");
  const command = fieldOf(input, "command");
  const cwd = fieldOf(payload, "cwd");
  if (typeof command !== "string") {
    return null;
  }
  return { command, cwd: typeof cwd === "string" ? cwd : process.cwd() };
}

/** A field of a parsed JSON object; undefined when it is not an object. */
function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
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
