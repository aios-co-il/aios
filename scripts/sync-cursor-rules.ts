// Generates .cursor/rules/*.mdc from .claude/rules/*.md so each rule has one source.
// Run `node scripts/sync-cursor-rules.ts`; add `--check` to fail when a twin is stale.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const SOURCE_DIR = ".claude/rules";
const TARGET_DIR = ".cursor/rules";
const check = process.argv.includes("--check");

const stale: string[] = [];

for (const file of readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".md"))) {
  const name = file.replace(/\.md$/, "");
  const source = readFileSync(`${SOURCE_DIR}/${file}`, "utf8");
  const parsed = source.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  const heading = parsed?.[2].match(/^# (.+)$/m);
  if (!parsed || !heading) {
    throw new Error(`${file}: expected frontmatter and a "# Title" heading`);
  }
  const [, frontmatter, body] = parsed;
  const globs = [...frontmatter.matchAll(/- "(.+)"/g)].map((m) => m[1]);
  const description = heading[1];

  const output = `---
description: ${description}
globs: ${globs.join(",")}
alwaysApply: false
---

<!-- Generated from ${SOURCE_DIR}/${file} by scripts/sync-cursor-rules.ts; edit that file. -->

${body}`;

  const target = `${TARGET_DIR}/${name}.mdc`;
  if (check) {
    const current = readFileSync(target, "utf8");
    if (current !== output) {
      stale.push(target);
    }
  } else {
    writeFileSync(target, output);
  }
}

if (stale.length > 0) {
  console.error(
    `Stale Cursor rules, run node scripts/sync-cursor-rules.ts:\n${stale.join("\n")}`,
  );
  process.exit(1);
}
