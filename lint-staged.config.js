import { basename } from "node:path";

const quoted = (files) => files.map((f) => `"${f}"`).join(" ");

// Globs must not overlap: lint-staged runs matching tasks concurrently, so two tasks would race on one file.
// Each file belongs to exactly one task: code (format, then lint), rule sources (format, generate twins),
// or anything else (format).
export default {
  "*.{ts,tsx,js,mjs}": ["prettier --write", "eslint --cache --quiet"],
  ".claude/rules/*.md": (files) => [
    `prettier --write ${quoted(files)}`,
    `node scripts/sync-cursor-rules.ts ${quoted(files)}`,
    `git add ${files.map((f) => `".cursor/rules/${basename(f, ".md")}.mdc"`).join(" ")}`,
  ],
  "!(*.{ts,tsx,js,mjs}|.claude/rules/*.md)":
    "prettier --write --ignore-unknown",
};
