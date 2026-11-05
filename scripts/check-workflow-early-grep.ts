#!/usr/bin/env node
/**
 * Guard: no workflow pipes a command into a grep that stops reading at its
 * first match (-q, -m, -l, -L, --quiet, --silent, --max-count). GitHub runs
 * `bash` steps with `-o pipefail`, so the writer gets SIGPIPE (exit 141) once
 * its output outgrows the pipe buffer, the pipeline fails and an `if` takes
 * the wrong branch: a path filter then skips the tests it guards on a large PR
 * (AIO-410). Read the whole input instead: `grep -E '…' >/dev/null`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGuard(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
}

/** 1-based line numbers where a pipe (not `||`) feeds an early-exiting grep. */
export function earlyExitGrepLines(source: string): Array<number> {
  return source
    .split("\n")
    .flatMap((line, index) => (isEarlyExitGrep(line) ? [index + 1] : []));
}

/** Whether a pipe feeds this line's grep a flag that stops it at the first match. */
function isEarlyExitGrep(line: string): boolean {
  return /(?<!\|)\|(?!\|)\s*grep\b[^|]*\s(?:-[A-Za-z]*[qmlL]|--(?:quiet|silent|max-count|files-with(?:out)?-match(?:es)?))/.test(
    line,
  );
}

/** Scans .github/workflows under `root`; exits 1 listing every offending line. */
function runGuard(root: string): void {
  const dir = join(root, ".github", "workflows");
  const offenders = readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .flatMap((file) =>
      earlyExitGrepLines(readFileSync(join(dir, file), "utf8")).map(
        (line) => `.github/workflows/${file}:${line}`,
      ),
    );
  if (offenders.length) {
    console.error("Workflows pipe into a grep that stops early:");
    for (const offender of offenders) {
      console.error(`  ${offender}`);
    }
    console.error(
      "Under pipefail the writer gets SIGPIPE on large input; use `grep -E '…' >/dev/null`.",
    );
    process.exit(1);
  }
  console.log("Workflow greps: none stop reading early.");
}
