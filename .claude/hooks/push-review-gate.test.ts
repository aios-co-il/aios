import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pushDecision, recordReview } from "./push-review-gate.ts";

const repos: Array<string> = [];

afterEach(() => {
  for (const dir of repos.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Runs git in `dir`. */
function git(dir: string, ...args: Array<string>): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

/** A clone whose origin/develop has one commit, on a branch with one more. */
function repoWithChange(): string {
  const dir = mkdtempSync(join(tmpdir(), "push-review-gate-"));
  repos.push(dir);
  git(dir, "init", "-q", "-b", "develop");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "a.txt"), "one\ntwo\nthree\nfour\nfive\nsix\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "update-ref", "refs/remotes/origin/develop", "HEAD");
  git(dir, "checkout", "-q", "-b", "feature");
  writeFileSync(
    join(dir, "a.txt"),
    "one\ntwo\nthree\nfour\nfive\nsix\nchange\n",
  );
  git(dir, "commit", "-q", "-am", "change");
  return dir;
}

/** The gate's decision for this command run in this clone. */
function decisionFor(dir: string, command: string) {
  return pushDecision(JSON.stringify({ cwd: dir, tool_input: { command } }));
}

describe("pushDecision", () => {
  it("blocks a push of changes no review recorded", () => {
    const dir = repoWithChange();

    const decision = decisionFor(dir, "git push -u origin feature");

    expect(decision?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision?.hookSpecificOutput.permissionDecisionReason).toContain(
      "/code-review origin/develop",
    );
  });

  it("lets a reviewed push through, and blocks it again once the code changes", () => {
    const dir = repoWithChange();
    expect(recordReview(dir)).toContain("Review recorded");

    expect(decisionFor(dir, "git push")).toBeNull();

    writeFileSync(
      join(dir, "a.txt"),
      "one\ntwo\nthree\nfour\nfive\nsix\nchange\nmore\n",
    );
    git(dir, "commit", "-q", "-am", "more");
    expect(decisionFor(dir, "git push")).not.toBeNull();
  });

  it("keeps the record when develop changes a line within the change's context", () => {
    const dir = repoWithChange();
    recordReview(dir);
    git(dir, "checkout", "-q", "develop");
    writeFileSync(join(dir, "a.txt"), "one\ntwo\nthree\nFOUR\nfive\nsix\n");
    git(dir, "commit", "-q", "-am", "develop moves on");
    git(dir, "update-ref", "refs/remotes/origin/develop", "HEAD");
    git(dir, "checkout", "-q", "feature");

    git(dir, "rebase", "-q", "origin/develop");

    expect(decisionFor(dir, "git push")).toBeNull();
  });

  it("asks for a fetch when origin/develop is missing", () => {
    const dir = repoWithChange();
    git(dir, "update-ref", "-d", "refs/remotes/origin/develop");

    const reason = decisionFor(dir, "git push")?.hookSpecificOutput
      .permissionDecisionReason;

    expect(reason).toContain("git fetch origin develop");
  });

  it("blocks a push it cannot read, and nothing else", () => {
    expect(pushDecision("not json git push")).not.toBeNull();
    expect(pushDecision("not json")).toBeNull();
  });
});
