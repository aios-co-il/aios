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
  test("names the commit, the branch, the cherry-pick and the exact PR title", () => {
    const prompt = buildAgentPrompt(unported);
    expect(prompt).toContain("abc1234 fix(leads): hide kanban columns");
    expect(prompt).toContain(
      "git switch -c chore/AIO-291/backport-abc1234 origin/develop --no-track",
    );
    expect(prompt).toContain("git cherry-pick -x abc1234def5678");
    expect(prompt).toContain(
      "titled exactly: fix(leads): hide kanban columns outside the stage filter [AIO-291]",
    );
    expect(prompt).not.toMatch(/titled exactly: .*\(#891\)/);
  });

  test("tells the agent to ask for the Linear issue when the subject has none", () => {
    const prompt = buildAgentPrompt({
      ...unported,
      commits: [
        { sha: "abc1234def5678", subject: "fix(leads): no issue here" },
      ],
    });
    expect(prompt).toContain("chore/<issue>/backport-abc1234");
    expect(prompt).toContain("Ask the user for the AIO-xx ID before step 3.");
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
