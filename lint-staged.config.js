export default {
  "*": "prettier --write --ignore-unknown",
  ".claude/rules/*.md": () => [
    "node scripts/sync-cursor-rules.ts",
    "git add .cursor/rules",
  ],
};
