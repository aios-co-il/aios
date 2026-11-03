// Generates .cursor/rules/*.mdc from .claude/rules/*.md so each rule has one source.
// Run `node scripts/sync-cursor-rules.ts [source.md ...]`; with no paths every rule is generated.
// Add `--check` to fail when a twin is stale or orphaned (its source rule no longer exists).
import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename } from "node:path";

const SOURCE_DIR = ".claude/rules";
const TARGET_DIR = ".cursor/rules";
const GENERATED_MARKER = "by scripts/sync-cursor-rules.ts; edit that file.";
const args = process.argv.slice(2);
const check = args.includes("--check");
const requested = args
  .filter((a) => !a.startsWith("--"))
  .map((a) => basename(a));

const readNormalized = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const allSources = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".md"));
const sources =
  requested.length > 0
    ? allSources.filter((f) => requested.includes(f))
    : allSources;

const stale: string[] = [];

for (const file of sources) {
  const name = file.replace(/\.md$/, "");
  const source = readNormalized(`${SOURCE_DIR}/${file}`);
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

<!-- Generated from ${SOURCE_DIR}/${file} ${GENERATED_MARKER} -->

${body}`;

  const target = `${TARGET_DIR}/${name}.mdc`;
  if (check) {
    if (!existsSync(target) || readNormalized(target) !== output) {
      stale.push(target);
    }
  } else {
    writeFileSync(target, output);
  }
}

// Twins whose source rule was deleted or renamed; only a full run knows the whole source set.
if (requested.length === 0) {
  const expected = new Set(allSources.map((f) => f.replace(/\.md$/, ".mdc")));
  for (const file of readdirSync(TARGET_DIR).filter((f) =>
    f.endsWith(".mdc"),
  )) {
    // Hand-written Cursor rules have no source; only files carrying our marker are generated twins.
    const generated = readNormalized(`${TARGET_DIR}/${file}`).includes(
      GENERATED_MARKER,
    );
    if (expected.has(file) || !generated) {
      continue;
    }
    if (check) {
      stale.push(`${TARGET_DIR}/${file} (orphaned)`);
    } else {
      unlinkSync(`${TARGET_DIR}/${file}`);
    }
  }
}

if (stale.length > 0) {
  console.error(
    `Stale Cursor rules, run node scripts/sync-cursor-rules.ts:\n${stale.join("\n")}`,
  );
  process.exit(1);
}
