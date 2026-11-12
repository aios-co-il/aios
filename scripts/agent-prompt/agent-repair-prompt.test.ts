import { describe, expect, test } from "vitest";
import { buildAgentPrompt, type PromptInput } from "./agent-repair-prompt.ts";

const hotfix = {
  sha: "abc1234def5678",
  subject:
    "fix(leads): hide kanban columns outside the stage filter [AIO-291] (#891)",
};

const unported: PromptInput = {
  kind: "unported-hotfix",
  repo: "aios-co-il/aios",
  commits: [hotfix],
};

describe("buildAgentPrompt", () => {
  test("names the commit, the rolling branch, the cherry-pick and the fixed PR title", () => {
    const prompt = buildAgentPrompt(unported);
    expect(prompt).toContain("abc1234 fix(leads): hide kanban columns");
    expect(prompt).toContain(
      "git switch -c backport/main-hotfixes origin/develop --no-track",
    );
    expect(prompt).toContain("git cherry-pick -x abc1234def5678");
    expect(prompt).toContain(
      "titled exactly: ci(backport): port main hotfixes to develop [AIO-145]",
    );
  });

  test("never asks the user for anything, whether or not the subject has an issue", () => {
    const prompt = buildAgentPrompt({
      ...unported,
      commits: [
        { sha: "abc1234def5678", subject: "fix(leads): no issue here" },
      ],
    });
    expect(prompt).not.toMatch(/ask the user/i);
    expect(prompt).toContain("Linear issue: AIO-145");
  });

  test("always carries the prohibitions and the stop condition", () => {
    const prompt = buildAgentPrompt(unported);
    expect(prompt).toContain("Force-push");
    expect(prompt).toContain(
      "Add the PR to the merge queue, enable auto-merge, or merge anything.",
    );
    expect(prompt).toContain("Reply with the PR link and stop.");
    expect(prompt).toContain(
      "`scripts/main-missing-from.sh origin/develop` exits 0",
    );
  });

  test("points at an existing backport PR instead of asking for a new one", () => {
    const prompt = buildAgentPrompt({
      ...unported,
      existingBackportPr: "https://github.com/aios-co-il/aios/pull/1200",
    });
    expect(prompt).toContain(
      "A backport PR already exists: https://github.com/aios-co-il/aios/pull/1200",
    );
  });

  test("pushes onto the open backport branch instead of opening another PR", () => {
    const url = "https://github.com/aios-co-il/aios/pull/1200";
    for (const input of [
      { ...unported, existingBackportPr: url },
      {
        kind: "backport-conflict" as const,
        repo: "aios-co-il/aios",
        commits: [hotfix],
        hotfixPr: "https://github.com/aios-co-il/aios/pull/891",
        conflictingFiles: ["src/pages/Leads.tsx"],
        existingBackportPr: url,
      },
    ]) {
      const prompt = buildAgentPrompt(input);
      expect(prompt).toContain(
        "git switch -c backport/main-hotfixes origin/backport/main-hotfixes --no-track",
      );
      expect(prompt).toContain("then git merge origin/develop");
      expect(prompt).toContain("git push origin HEAD:backport/main-hotfixes");
      expect(prompt).toContain("Do not open another PR.");
      expect(prompt).not.toContain("origin/develop --no-track");
    }
  });

  test("lists the conflicting files and the hotfix PR for a conflict", () => {
    const prompt = buildAgentPrompt({
      kind: "backport-conflict",
      repo: "aios-co-il/aios",
      commits: [hotfix],
      hotfixPr: "https://github.com/aios-co-il/aios/pull/891",
      conflictingFiles: ["src/pages/Leads.tsx"],
    });
    expect(prompt).toContain("finish a backport that hit a merge conflict");
    expect(prompt).toContain("pull/891 onto develop stopped on a conflict");
    expect(prompt).toContain("  - src/pages/Leads.tsx");
  });

  test("points a truncated conflict file list at the git diff command", () => {
    const prompt = buildAgentPrompt({
      kind: "backport-conflict",
      repo: "aios-co-il/aios",
      commits: [hotfix],
      hotfixPr: "https://github.com/aios-co-il/aios/pull/891",
      conflictingFiles: Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`),
    });
    expect(prompt).toContain("... and 2 more. Run `git diff --name-only");
    expect(prompt).not.toContain("... and 2 more. Run `scripts/main-missing");
  });

  test("truncates long lists and says how to get the rest", () => {
    const commits = Array.from({ length: 13 }, (_, index) => ({
      sha: `${String(index).padStart(7, "0")}ffff`,
      subject: `fix(x): change ${index} [AIO-${index + 1}]`,
    }));
    const prompt = buildAgentPrompt({ ...unported, commits });
    expect(prompt).toContain("... and 3 more.");
    expect(prompt).toContain("0000009 fix(x): change 9");
    expect(prompt).not.toContain("0000010 fix(x): change 10");
  });
});
