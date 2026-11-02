export default {
  "*": "prettier --write --ignore-unknown",
  "*.{ts,tsx,js,mjs}": "eslint --cache --quiet",
  ".claude/rules/*.md": () => [
    "node scripts/sync-cursor-rules.ts",
    "git add .cursor/rules",
  ],
};
