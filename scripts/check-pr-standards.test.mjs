import assert from "node:assert/strict";
import test from "node:test";
import {
  findCasts,
  findOpsScripts,
  findOversizedNewFiles,
  parseAddedLines,
  parseNameStatus,
} from "./check-pr-standards.mjs";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,0 +11,2 @@ fn
+const x = y as any;
+const ok = 1;
@@ -20 +22 @@
+const z = w as unknown as Foo;
diff --git a/old.ts b/old.ts
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-const gone = q as any;
`;

test("parses added lines with their new line numbers", () => {
  assert.deepEqual(parseAddedLines(DIFF), [
    { path: "src/a.ts", line: 11, text: "const x = y as any;" },
    { path: "src/a.ts", line: 12, text: "const ok = 1;" },
    { path: "src/a.ts", line: 22, text: "const z = w as unknown as Foo;" },
  ]);
});

test("flags added casts only, in code files", () => {
  const added = [
    ...parseAddedLines(DIFF),
    { path: "docs/x.md", line: 1, text: "use `as any`" },
    { path: "node_modules/p/i.js", line: 1, text: "a as any" },
    { path: "src/b.ts", line: 3, text: "const hasAnyone = list.has(anyone)" },
  ];
  assert.deepEqual(
    findCasts(added).map((f) => f.where),
    ["src/a.ts:11", "src/a.ts:22"],
  );
});

test("parses name-status, renames keep the new path", () => {
  assert.deepEqual(
    parseNameStatus("A\tsrc/new.ts\nM\tsrc/old.ts\nR087\tsrc/a.ts\tsrc/b.ts\n"),
    [
      { status: "A", path: "src/new.ts" },
      { status: "M", path: "src/old.ts" },
      { status: "R", path: "src/b.ts" },
    ],
  );
});

test("new source files over the limit fail; modified and generated do not", () => {
  const sizes = {
    "src/Big.tsx": 181,
    "src/Small.tsx": 180,
    "src/Legacy.tsx": 900,
    "src/a.test.ts": 240,
    "src/b.test.ts": 251,
    "src/integrations/supabase/types.ts": 20000,
    "supabase/migrations/x.sql": 500,
  };
  const files = [
    { status: "A", path: "src/Big.tsx" },
    { status: "A", path: "src/Small.tsx" },
    { status: "M", path: "src/Legacy.tsx" },
    { status: "A", path: "src/a.test.ts" },
    { status: "A", path: "src/b.test.ts" },
    { status: "A", path: "src/integrations/supabase/types.ts" },
    { status: "A", path: "supabase/migrations/x.sql" },
  ];
  assert.deepEqual(
    findOversizedNewFiles(files, (p) => sizes[p]).map((f) => f.where),
    ["src/Big.tsx", "src/b.test.ts"],
  );
});

test("new supabase/ops files fail; edits and deletions there do not", () => {
  const files = [
    { status: "A", path: "supabase/ops/new.sql" },
    { status: "M", path: "supabase/ops/old.sql" },
    { status: "D", path: "supabase/ops/gone.sql" },
  ];
  assert.deepEqual(
    findOpsScripts(files).map((f) => f.where),
    ["supabase/ops/new.sql"],
  );
});
