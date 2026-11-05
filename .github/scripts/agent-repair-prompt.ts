export type HotfixCommit = { sha: string; subject: string };

export type PromptInput =
  | {
      kind: "unported-hotfix";
      repo: string;
      commits: Array<HotfixCommit>;
      existingBackportPr?: string;
    }
  | {
      kind: "backport-conflict";
      repo: string;
      commits: Array<HotfixCommit>;
      hotfixPr: string;
      conflictingFiles: Array<string>;
    };

const MAX_LISTED = 10;
const ISSUE_RE = /\bAIO-\d+\b/;
const PR_NUMBER_SUFFIX_RE = / \(#\d+\)$/;

/**
 * Builds the paste-ready prompt a product owner gives their coding agent when a
 * release is blocked by a hotfix that `develop` does not have yet.
 * Layout is Task, When, Do, Values, Don't, Done when: an empty section means the
 * prompt is incomplete, so every section always has text.
 */
export function buildAgentPrompt(input: PromptInput): string {
  const shas = input.commits.map((commit) => commit.sha);
  const issue = findIssue(input.commits);
  const branch = `chore/${issue ?? "<issue>"}/backport-${shas[0].slice(0, 7)}`;
  return [
    taskLine(input),
    "",
    "When:",
    ...whenLines(input),
    "",
    "Do:",
    "1. Read AGENTS.md and CODING_STANDARDS.md in full.",
    "2. git fetch origin develop main",
    `3. git switch -c ${branch} origin/develop --no-track`,
    `4. git cherry-pick -x ${shas.join(" ")}   (oldest first)`,
    "5. On a conflict, resolve it against current develop so both sides keep their intent, then git add and git cherry-pick --continue.",
    "6. pnpm format:check",
    `7. git push -u origin HEAD, then open a PR to develop titled exactly: ${prTitle(input.commits[0])}`,
    "",
    "Values:",
    `- Repository: ${input.repo}`,
    `- Linear issue: ${issue ?? "not in the commit subject. Ask the user for the AIO-xx ID before step 3."}`,
    ...existingPrLine(input),
    "",
    "Don't:",
    "- Force-push, or take --ours or --theirs for a whole file.",
    "- Add the PR to the merge queue, enable auto-merge, or merge anything.",
    "- Push to main or change Production.",
    "",
    "Done when: the PR is open and its CI has started. Reply with the PR link and stop.",
    "A human queues it. After it merges, `scripts/main-missing-from.sh origin/develop` exits 0, and the Release workflow can be run again.",
  ].join("\n");
}

/** One-line statement of why the release is blocked. */
function taskLine(input: PromptInput): string {
  return input.kind === "unported-hotfix"
    ? "Task: port hotfix commits from main to develop. The Release workflow is blocked until they land."
    : "Task: finish a backport that hit a merge conflict. The Release workflow is blocked until it lands.";
}

/** The trigger section: the failing check and the commits or files involved. */
function whenLines(input: PromptInput): Array<string> {
  if (input.kind === "unported-hotfix") {
    return [
      "`scripts/main-missing-from.sh origin/develop` exits 1. These main commits have no equivalent on develop:",
      ...listCommits(input.commits),
    ];
  }
  return [
    `The automatic cherry-pick of ${input.hotfixPr} onto develop stopped on a conflict. Commits to port:`,
    ...listCommits(input.commits),
    "Conflicting files:",
    ...truncate(input.conflictingFiles, (file) => `  - ${file}`),
  ];
}

/** Short sha plus subject, one line per commit. */
function listCommits(commits: Array<HotfixCommit>): Array<string> {
  return truncate(
    commits,
    (commit) => `  - ${commit.sha.slice(0, 7)} ${commit.subject}`,
  );
}

/** Lists at most MAX_LISTED entries and says how to see the rest. */
function truncate<T>(
  items: Array<T>,
  format: (item: T) => string,
): Array<string> {
  const lines = items.slice(0, MAX_LISTED).map(format);
  const hidden = items.length - MAX_LISTED;
  if (hidden > 0) {
    lines.push(
      `  - ... and ${hidden} more. Run \`scripts/main-missing-from.sh origin/develop\` for the full list.`,
    );
  }
  return lines;
}

/** Sends the agent to an open backport PR rather than a duplicate. */
function existingPrLine(input: PromptInput): Array<string> {
  if (input.kind !== "unported-hotfix" || !input.existingBackportPr) {
    return [];
  }
  return [
    `- A backport PR already exists: ${input.existingBackportPr}. Review and fix that PR instead of opening another.`,
  ];
}

/** First Linear issue ID found in the commit subjects, or null. */
function findIssue(commits: Array<HotfixCommit>): string | null {
  for (const commit of commits) {
    const match = ISSUE_RE.exec(commit.subject);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/** Keeps the original conventional title and drops the "(#123)" squash suffix. */
function prTitle(commit: HotfixCommit): string {
  return commit.subject.replace(PR_NUMBER_SUFFIX_RE, "");
}
