#!/usr/bin/env node
// PR standards gate: checks only what a branch ADDS relative to its base, so
// legacy code never blocks a PR. Rules: docs/agents/code-standards.md.
//
//   node scripts/check-pr-standards.mjs [--base <sha|ref>]   (default origin/develop)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MAX_NEW_FILE_LINES = 180;
export const MAX_NEW_TEST_FILE_LINES = 250;

const CODE_FILE = /\.(ts|tsx|js|mjs|cjs|jsx)$/;
const SIZED_FILE = /^(src|supabase\/functions)\/.*\.(ts|tsx)$/;
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/(__tests__|tests)\/)/;
const GENERATED = /(^|\/)(types|database\.types)\.ts$/;
const SKIPPED_DIR = /(^|\/)(node_modules|dist)\//;
// This gate and its tests spell out the banned casts on purpose.
const SELF = /^scripts\/check-pr-standards(\.test)?\.mjs$/;
const CAST = /\bas\s+any\b|\bas\s+unknown\s+as\b/;

/** `git diff --name-status` output → [{ status, path }] (renames use the new path). */
export function parseNameStatus(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return { status: parts[0][0], path: parts[parts.length - 1] };
    });
}

/** `git diff -U0` output → [{ path, line, text }] for every added line. */
export function parseAddedLines(diff) {
  const added = [];
  let path = null;
  let line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      path = raw.startsWith("+++ b/") ? raw.slice(6) : null;
    } else if (raw.startsWith("@@")) {
      const m = /\+(\d+)/.exec(raw);
      line = m ? Number(m[1]) : 0;
    } else if (path && raw.startsWith("+")) {
      added.push({ path, line, text: raw.slice(1) });
      line += 1;
    }
  }
  return added;
}

export function findCasts(addedLines) {
  return addedLines
    .filter(
      (l) =>
        CODE_FILE.test(l.path) &&
        !SKIPPED_DIR.test(l.path) &&
        !SELF.test(l.path) &&
        CAST.test(l.text),
    )
    .map((l) => ({
      rule: "no-cast",
      where: `${l.path}:${l.line}`,
      detail: "type it instead of `as any` / `as unknown as`",
    }));
}

export function findOversizedNewFiles(files, countLines) {
  return files
    .filter(
      (f) =>
        f.status === "A" && SIZED_FILE.test(f.path) && !GENERATED.test(f.path),
    )
    .map((f) => {
      const limit = TEST_FILE.test(f.path)
        ? MAX_NEW_TEST_FILE_LINES
        : MAX_NEW_FILE_LINES;
      return { f, lines: countLines(f.path), limit };
    })
    .filter(({ lines, limit }) => lines > limit)
    .map(({ f, lines, limit }) => ({
      rule: "new-file-size",
      where: f.path,
      detail: `${lines} lines (max ${limit}); split it into smaller files`,
    }));
}

export function findOpsScripts(files) {
  return files
    .filter((f) => f.status === "A" && f.path.startsWith("supabase/ops/"))
    .map((f) => ({
      rule: "no-ops-script",
      where: f.path,
      detail:
        "supabase/ops is being retired; use an idempotent migration or ask a dev to run it",
    }));
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function main() {
  const i = process.argv.indexOf("--base");
  const base = i > -1 ? process.argv[i + 1] : "origin/develop";
  const range = `${base}...HEAD`;
  const files = parseNameStatus(git(["diff", "--name-status", range]));
  const added = parseAddedLines(git(["diff", "-U0", "--no-color", range]));
  const countLines = (p) =>
    readFileSync(p, "utf8").replace(/\n$/, "").split("\n").length;

  const findings = [
    ...findCasts(added),
    ...findOversizedNewFiles(files, countLines),
    ...findOpsScripts(files),
  ];
  if (findings.length === 0) {
    console.log(`PR standards: OK (${files.length} changed files vs ${base})`);
    return;
  }
  console.error(`PR standards: ${findings.length} finding(s) vs ${base}`);
  for (const f of findings)
    console.error(`  [${f.rule}] ${f.where} — ${f.detail}`);
  console.error("See docs/agents/code-standards.md");
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
