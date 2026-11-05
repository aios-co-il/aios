import { describe, expect, test } from "vitest";
import { buildReleaseNotes } from "./release-notes.ts";

describe("buildReleaseNotes", () => {
  const subjects = [
    "feat(groups): add invite notifications [AIO-123] (#900)",
    "fix(leads): hide kanban columns [AIO-291] (#891)",
    "chore(cloud): add pnpm install (#925)",
    "Merge pull request #915 from aios-co-il/develop",
    "release pr",
  ];

  test("groups by type and links Linear issues", () => {
    const notes = buildReleaseNotes({ version: "v1.5.0", subjects });
    expect(notes).toContain("## v1.5.0");
    expect(notes).toContain(
      "### Features\n- feat(groups): add invite notifications [AIO-123](https://linear.app/aios-co/issue/AIO-123) (#900)",
    );
    expect(notes).toContain("### Fixes\n- fix(leads): hide kanban columns");
    expect(notes).toContain("### Other changes\n- chore(cloud)");
  });

  test("leaves merge commits and the old release commit out of the count", () => {
    const notes = buildReleaseNotes({ version: "v1.5.0", subjects });
    expect(notes).not.toContain("Merge pull request");
    expect(notes).toContain("3 changes since the previous release.");
  });

  test("puts the product owner's note first", () => {
    const notes = buildReleaseNotes({
      version: "v1.5.0",
      subjects,
      notes: "  Includes the invite flow.  ",
    });
    expect(notes).toMatch(
      /## v1\.5\.0\n\nIncludes the invite flow\.\n\n### Features/,
    );
  });

  test("keeps subjects without a conventional type visible", () => {
    const notes = buildReleaseNotes({
      version: "v1.5.0",
      subjects: ["tweak the thing"],
    });
    expect(notes).toContain("### Uncategorised\n- tweak the thing");
  });
});
