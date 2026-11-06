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
      existingBackportPr?: string;
      /** Title of the hotfix PR. Falls back to the first commit subject. */
      prTitle?: string;
      conflictingFiles: Array<string>;
    };

/** The rolling branch behind the one open backport PR (see .github/workflows/backport.yml). */
const BACKPORT_BRANCH = "backport/main-hotfixes";
const MAX_LISTED = 10;
const ISSUE_RE = /\bAIO-\d+\b/;
const PR_NUMBER_SUFFIX_RE = / \(#\d+\)$/;
const COMMITS_HINT =
  "Run `scripts/main-missing-from.sh origin/develop` for the full list.";
const FILES_HINT =
  "Run `git diff --name-only --diff-filter=U` after the cherry-pick stops for the full list.";

/**
 * Builds the paste-ready prompt a product owner gives their coding agent when a
 * release is blocked by a hotfix that `develop` does not have yet.
 * Layout is Task, When, Do, Values, Don't, Done when: an empty section means the
 * prompt is incomplete, so every section always has text.
 */
export function buildAgentPrompt(input: PromptInput): string {
  const shas = input.commits.map((commit) => commit.sha);
  const issue = findIssue(input.commits);
  const existing = existingBackportPr(input);
  const branch = existing
    ? BACKPORT_BRANCH
    : `chore/${issue ?? "<issue>"}/backport-${shas[0].slice(0, 7)}`;
  return [
    taskLine(input),
    "",
    "When:",
    ...whenLines(input),
    "",
    "Do:",
    "1. Read AGENTS.md and CODING_STANDARDS.md in full.",
    existing
      ? `2. git fetch origin develop main ${BACKPORT_BRANCH}`
      : "2. git fetch origin develop main",
    existing
      ? `3. git switch -c ${branch} origin/${branch} --no-track`
      : `3. git switch -c ${branch} origin/develop --no-track`,
    `4. git cherry-pick -x ${shas.join(" ")}   (oldest first)`,
    "5. On a conflict, resolve it against current develop so both sides keep their intent, then git add and git cherry-pick --continue.",
    "6. pnpm format:check",
    existing
      ? `7. git push origin HEAD:${branch} (a fast-forward onto the open backport PR). Do not open another PR.`
      : `7. git push -u origin HEAD, then open a PR to develop titled exactly: ${prTitle(input)}`,
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
    existing
      ? "Done when: the commits are pushed to the existing PR and its CI has restarted. Reply with the PR link and stop."
      : "Done when: the PR is open and its CI has started. Reply with the PR link and stop.",
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
    ...truncate(input.conflictingFiles, (file) => `  - ${file}`, FILES_HINT),
  ];
}

/** Short sha plus subject, one line per commit. */
function listCommits(commits: Array<HotfixCommit>): Array<string> {
  return truncate(
    commits,
    (commit) => `  - ${commit.sha.slice(0, 7)} ${commit.subject}`,
    COMMITS_HINT,
  );
}

/** Lists at most MAX_LISTED entries and appends `hint` saying how to see the rest. */
function truncate<T>(
  items: Array<T>,
  format: (item: T) => string,
  hint: string,
): Array<string> {
  const lines = items.slice(0, MAX_LISTED).map(format);
  const hidden = items.length - MAX_LISTED;
  if (hidden > 0) {
    lines.push(`  - ... and ${hidden} more. ${hint}`);
  }
  return lines;
}

/** URL of the open backport PR whose branch the commits go onto, if there is one. */
function existingBackportPr(input: PromptInput): string | undefined {
  return input.existingBackportPr;
}

/** Sends the agent to an open backport PR rather than a duplicate. */
function existingPrLine(input: PromptInput): Array<string> {
  const url = existingBackportPr(input);
  if (!url) {
    return [];
  }
  return [
    `- A backport PR already exists: ${url}. Add the commits to its branch (${BACKPORT_BRANCH}) instead of opening another.`,
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

/**
 * The hotfix PR's own title when known (conflict path), else the first commit subject
 * without its "(#123)" squash suffix.
 */
function prTitle(input: PromptInput): string {
  if (input.kind === "backport-conflict" && input.prTitle) {
    return input.prTitle;
  }
  return input.commits[0].subject.replace(PR_NUMBER_SUFFIX_RE, "");
}
