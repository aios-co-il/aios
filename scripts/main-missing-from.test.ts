import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const script = resolve(__dirname, "main-missing-from.sh");

let root: string;
let repo: string;
let clock: number;

// Each commit gets a later date, because the script compares commit dates.
function git(...args: Array<string>): string {
  clock += 60;
  const date = new Date(clock * 1000).toISOString();
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@aios.co.il",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@aios.co.il",
    },
  }).trim();
}

function commit(file: string, content: string, message: string): string {
  writeFileSync(join(repo, file), content);
  git("add", file);
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

// Ports two consecutive main commits onto develop as one squashed commit.
function portSquashed(first: string, last: string, message: string) {
  const range = `${git("rev-parse", first)}^..${git("rev-parse", last)}`;
  git("checkout", "-q", "develop");
  git("cherry-pick", "-n", range);
  git("commit", "-q", "-m", message);
}

function check() {
  git("push", "-q", "origin", "main", "develop");
  return spawnSync("bash", [script, "origin/develop"], {
    cwd: repo,
    encoding: "utf8",
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "main-missing-"));
  repo = join(root, "work");
  clock = Date.UTC(2026, 0, 1) / 1000;
  execFileSync("git", ["init", "-q", "--bare", join(root, "origin.git")]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("remote", "add", "origin", join(root, "origin.git"));
  commit("app.txt", "base\n", "base");
  git("branch", "develop");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("main-missing-from.sh", () => {
  test("an unported hotfix on main is reported", () => {
    commit("hotfix.txt", "fix\n", "fix: hotfix");

    const result = check();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fix: hotfix");
  });

  test("a squash-merged release counts as present", () => {
    git("checkout", "-q", "develop");
    commit("a.txt", "a\n", "feat: a");
    commit("b.txt", "b\n", "feat: b");
    git("checkout", "-q", "main");
    commit("hotfix.txt", "fix\n", "fix: hotfix");
    portSquashed("HEAD", "HEAD", "fix: port hotfix");
    git("checkout", "-q", "main");
    git("merge", "-q", "--squash", "-X", "theirs", "develop");
    git("commit", "-q", "-m", "chore(release): a and b");

    const result = check();

    expect(result.stderr + result.stdout).not.toContain("no equivalent");
    expect(result.status).toBe(0);
  });

  test("an older squashed hotfix port stays found when a newer one follows", () => {
    // A develop-only feature keeps develop's tree different from main's.
    git("checkout", "-q", "develop");
    commit("feature.txt", "f\n", "feat: develop only");
    git("checkout", "-q", "main");
    const firstStart = commit("one.txt", "1\n", "fix: one, part 1");
    const firstEnd = commit("one.txt", "1\n1\n", "fix: one, part 2");
    portSquashed(firstStart, firstEnd, "fix: port one");
    // A single-commit hotfix, cherry-picked as is, separates the two runs.
    git("checkout", "-q", "main");
    const single = commit("small.txt", "s\n", "fix: small");
    git("checkout", "-q", "develop");
    git("cherry-pick", single);
    git("checkout", "-q", "main");
    const secondStart = commit("two.txt", "2\n", "fix: two, part 1");
    const secondEnd = commit("two.txt", "2\n2\n", "fix: two, part 2");
    portSquashed(secondStart, secondEnd, "fix: port two");

    const result = check();

    expect(result.stdout).toBe("");
    expect(result.status).toBe(0);
  });
});
