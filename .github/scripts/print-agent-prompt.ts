import { readFileSync } from "node:fs";
import { buildAgentPrompt, type PromptInput } from "./agent-repair-prompt.ts";

// Usage: node .github/scripts/print-agent-prompt.ts <input.json>
// The workflow writes the JSON (a PromptInput) and prints this output in its error and step summary.
const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error("::error::usage: print-agent-prompt.ts <input.json>");
  process.exit(1);
}
const input = JSON.parse(readFileSync(inputPath, "utf8")) as PromptInput;
if (input.commits.length === 0) {
  console.error("::error::print-agent-prompt.ts needs at least one commit");
  process.exit(1);
}
process.stdout.write(buildAgentPrompt(input));
