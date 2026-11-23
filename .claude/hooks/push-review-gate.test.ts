import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  pushDecision,
  pushesCommits,
  recordReview,
} from "./push-review-gate.ts";

/** A clone whose origin/develop has one commit, on a branch with one more. */
function repoWithChange(): string {
  const dir = mkdtempSync(join(tmpdir(), "push-review-gate-"));
  function git(...args: Array<string>) {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  }
  git("init", "-q", "-b", "develop");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "a.txt"), "base\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  git("update-ref", "refs/remotes/origin/develop", "HEAD");
  git("checkout", "-q", "-b", "feature");
  writeFileSync(join(dir, "a.txt"), "base\nchange\n");
  git("commit", "-q", "-am", "change");
  return dir;
}

/** The gate's decision for this command in this clone. */
function decisionFor(dir: string, command: string) {
  return pushDecision({ cwd: dir, tool_input: { command } });
}

describe("pushesCommits", () => {
  it.each([
    "git push -u origin feature",
    "cd repo && git push",
    "git -C repo push origin HEAD",
  ])("reads %s as a push", (command) => {
    expect(pushesCommits(command)).toBe(true);
  });

  it.each([
    "git status",
    "git push origin --delete old-branch",
    "git push origin :old-branch",
    "echo pushing",
  ])("leaves %s alone", (command) => {
    expect(pushesCommits(command)).toBe(false);
  });
});

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
    recordReview(dir);

    expect(decisionFor(dir, "git push")).toBeNull();

    writeFileSync(join(dir, "a.txt"), "base\nchange\nmore\n");
    execFileSync("git", ["commit", "-q", "-am", "more"], { cwd: dir });
    expect(decisionFor(dir, "git push")).not.toBeNull();
  });

  it("never judges a call that is not a push", () => {
    const dir = repoWithChange();

    expect(decisionFor(dir, "git log --oneline")).toBeNull();
  });
});
