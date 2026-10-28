import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The two GitHub drains (.github/workflows/render-worker.yml for Staging and
 * render-worker-preview.yml for each PR's Supabase preview) hold an account token that can
 * read every project's keys, Production's included.
 */
const WORKFLOWS = ["render-worker.yml", "render-worker-preview.yml"];

const workflow = (name) =>
  readFileSync(
    new URL(`../../.github/workflows/${name}`, import.meta.url),
    "utf8",
  );

const indentOf = (line) => line.match(/^ */)[0].length;

/** The job's steps in order, each with its name, `if:` and the script it runs. */
function steps(text) {
  const body = text.split(/^ {4}steps:\n/m)[1];
  return body
    .split(/^ {6}- /m)
    .slice(1)
    .map((chunk) => ({
      text: chunk,
      name:
        chunk.match(/^\s*name: (.+)$/m)?.[1] ??
        chunk.match(/^\s*uses: (.+)$/m)?.[1],
      id: chunk.match(/^\s*id: (.+)$/m)?.[1],
      if: chunk.match(/^\s*if: (.+)$/m)?.[1] ?? "",
      run: script(chunk),
    }));
}

/** A step's `run:` script, de-indented the way YAML reads a block scalar. */
function script(chunk) {
  const lines = chunk.split("\n");
  const at = lines.findIndex((line) => /^\s*run: /.test(line));
  if (at < 0) return "";
  const inline = lines[at].replace(/^\s*run: /, "");
  if (inline !== "|") return inline;
  const body = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() && indentOf(line) <= indentOf(lines[at])) break;
    body.push(line);
  }
  const pad = Math.min(
    ...body.filter((line) => line.trim()).map((line) => indentOf(line)),
  );
  return body.map((line) => line.slice(pad)).join("\n");
}

const usesToken = (step) => step.text.includes("secrets.BASE_ACCESS_TOKEN");
/** Checks out or runs the branch's code, or a dependency's. */
const runsBranchCode = (step) =>
  /actions\/checkout/.test(step.text) ||
  /working-directory:/.test(step.text) ||
  /\b(npm|npx|node|pnpm)\b/.test(step.run);

test.each(WORKFLOWS)(
  "%s uses the account token before any branch code or dependency runs",
  (name) => {
    const text = workflow(name);
    const all = steps(text);
    const lastToken = all.findLastIndex(usesToken);
    const firstBranch = all.findIndex(runsBranchCode);
    expect(lastToken).toBeGreaterThanOrEqual(0);
    expect(firstBranch).toBeGreaterThan(lastToken);
    // The job's GITHUB_TOKEN can only read the repository.
    expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
    // The lockfile pins every dependency, and no install script runs.
    const installs = all.filter((step) => /\bnpm\b/.test(step.run));
    expect(installs.length).toBeGreaterThan(0);
    for (const step of installs)
      expect(step.run).toMatch(/^npm ci --ignore-scripts /);
  },
);
