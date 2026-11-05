export type ReleaseNotesInput = {
  version: string;
  /** Commit subjects on develop that main does not have, newest first. */
  subjects: Array<string>;
  /** Free text the product owner typed when starting the release. */
  notes?: string;
};

const LINEAR_BASE_URL = "https://linear.app/aios-co/issue";
const TYPE_RE = /^(\w+)(?:\([^)]*\))?!?: /;
const ISSUE_RE = /\[(AIO-\d+)\]/g;

const SECTIONS: Array<{ title: string; types: Array<string> }> = [
  { title: "Features", types: ["feat"] },
  { title: "Fixes", types: ["fix", "revert"] },
  {
    title: "Other changes",
    types: ["perf", "refactor", "docs", "style", "test", "ci", "chore"],
  },
];

/**
 * Markdown for the release PR body and the GitHub Release. Groups conventional-commit
 * subjects by type and links each `[AIO-n]` to its Linear issue.
 */
export function buildReleaseNotes(input: ReleaseNotesInput): string {
  const subjects = input.subjects.filter((subject) => !isMergeSubject(subject));
  const lines = [`## ${input.version}`, ""];
  if (input.notes?.trim()) {
    lines.push(input.notes.trim(), "");
  }
  for (const section of SECTIONS) {
    const items = subjects.filter((subject) =>
      section.types.includes(typeOf(subject)),
    );
    if (items.length > 0) {
      lines.push(`### ${section.title}`, ...items.map(formatItem), "");
    }
  }
  const unknown = subjects.filter((subject) => !isKnownType(typeOf(subject)));
  if (unknown.length > 0) {
    lines.push("### Uncategorised", ...unknown.map(formatItem), "");
  }
  lines.push(`${subjects.length} changes since the previous release.`);
  return lines.join("\n");
}

/** Merge commits carry no change of their own, so they stay out of the notes. */
function isMergeSubject(subject: string): boolean {
  return subject.startsWith("Merge ") || subject === "release pr";
}

/** The conventional-commit type of a subject, or "" when it has none. */
function typeOf(subject: string): string {
  return TYPE_RE.exec(subject)?.[1] ?? "";
}

/** True when some section lists the type. */
function isKnownType(type: string): boolean {
  return SECTIONS.some((section) => section.types.includes(type));
}

/** One bullet with each `[AIO-n]` turned into a Linear link. */
function formatItem(subject: string): string {
  const linked = subject.replace(
    ISSUE_RE,
    (_, issue: string) => `[${issue}](${LINEAR_BASE_URL}/${issue})`,
  );
  return `- ${linked}`;
}
