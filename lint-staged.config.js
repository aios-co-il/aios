import { basename } from "node:path";

// One sequential task list per run: prettier must finish before the rule twins are generated from the
// formatted sources, and only twins of staged sources are generated and staged.
const isRule = (file) => /\.claude\/rules\/[^/]+\.md$/.test(file);

export default {
  "*": (files) => {
    const quoted = (list) => list.map((f) => `"${f}"`).join(" ");
    const rules = files.filter(isRule);
    const commands = [`prettier --write --ignore-unknown ${quoted(files)}`];
    if (rules.length > 0) {
      commands.push(
        `node scripts/sync-cursor-rules.ts ${quoted(rules)}`,
        `git add ${rules.map((f) => `".cursor/rules/${basename(f, ".md")}.mdc"`).join(" ")}`,
      );
    }
    return commands;
  },
  "*.{ts,tsx,js,mjs}": "eslint --cache --quiet",
};
