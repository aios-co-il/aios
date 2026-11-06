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
      conflictingFiles: Array<string>;
    };

/**
 * The rolling branch and title behind the one backport PR, which carries every
 * unported hotfix (see .github/workflows/backport.yml). AIO-145 tracks that automation.
 */
const BACKPORT_BRANCH = "backport/main-hotfixes";
const BACKPORT_TITLE = "ci(backport): port main hotfixes to develop [AIO-145]";
const MAX_LISTED = 10;
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
  const existing = input.existingBackportPr;
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
      ? `3. git switch -c ${BACKPORT_BRANCH} origin/${BACKPORT_BRANCH} --no-track, then git merge origin/develop (on a conflict, resolve it so both sides keep their intent, then git add and git commit)`
      : `3. git switch -c ${BACKPORT_BRANCH} origin/develop --no-track`,
    `4. git cherry-pick -x ${shas.join(" ")}   (oldest first)`,
    "5. On a conflict, resolve it against current develop so both sides keep their intent, then git add and git cherry-pick --continue.",
    "6. pnpm format:check",
    existing
      ? `7. git push origin HEAD:${BACKPORT_BRANCH} (a fast-forward onto the open backport PR). Do not open another PR.`
      : `7. git push -u origin HEAD, then open a PR to develop titled exactly: ${BACKPORT_TITLE}`,
    "",
    "Values:",
    `- Repository: ${input.repo}`,
    "- Linear issue: AIO-145, already in the title.",
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

/** Sends the agent to an open backport PR rather than a duplicate. */
function existingPrLine(input: PromptInput): Array<string> {
  const url = input.existingBackportPr;
  if (!url) {
    return [];
  }
  return [
    `- A backport PR already exists: ${url}. Add the commits to its branch (${BACKPORT_BRANCH}) instead of opening another.`,
  ];
}
