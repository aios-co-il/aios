import { describe, expect, test } from "vitest";

import { earlyExitGrepLines } from "./check-workflow-early-grep.ts";

describe("check-workflow-early-grep", () => {
  test("the old path filter, which skipped the tests on a large PR, is flagged", () => {
    const step = `          set -euo pipefail
          if [ -z "$BASE_SHA" ] || git diff --name-only "$BASE_SHA"...HEAD | grep -Eq '^supabase/|^\\.github/workflows/sql-tests\\.yml$'; then
            echo "sql=true" >> "$GITHUB_OUTPUT"`;
    expect(earlyExitGrepLines(step)).toEqual([2]);
  });

  test("the fixed filter reads the whole list and passes", () => {
    const step = `          if [ -z "$BASE_SHA" ] || git diff --name-only "$BASE_SHA"...HEAD | grep -E '^supabase/|^\\.github/workflows/sql-tests\\.yml$' >/dev/null; then`;
    expect(earlyExitGrepLines(step)).toEqual([]);
  });

  test("every flag that stops grep at its first match is flagged", () => {
    const lines = [
      "git log | grep -q fix",
      "git log | grep -m1 fix",
      "git log | grep -lE fix",
      "git log | grep --quiet fix",
      "git log | grep --max-count=1 fix",
    ];
    expect(earlyExitGrepLines(lines.join("\n"))).toEqual([1, 2, 3, 4, 5]);
  });

  test("greps that read everything, or read a file, are left alone", () => {
    const lines = [
      "grep -q fix CHANGELOG.md",
      "test -f x || grep -q fix CHANGELOG.md",
      "git log | grep -c fix",
      "git log | grep -vE 'wip|tmp'",
    ];
    expect(earlyExitGrepLines(lines.join("\n"))).toEqual([]);
  });
});
