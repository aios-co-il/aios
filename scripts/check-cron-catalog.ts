#!/usr/bin/env node
/**
 * Guard: every cron job a migration schedules has an entry in the jobs
 * catalog (src/lib/cronJobsCatalog*.ts), so the system-jobs screens show its
 * Hebrew name and whether it sends WhatsApp instead of a bare jobname
 * (AIO-313).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGuard(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
}

/** Job names passed to cron.schedule('<name>', …) in a migration's SQL. */
export function scheduledJobNames(sql: string): Set<string> {
  const names = new Set<string>();
  for (const match of sql.matchAll(/cron\.schedule\(\s*'([a-z0-9-]+)'/gi)) {
    names.add(match[1]);
  }
  return names;
}

/** Keys of the catalog entries in a catalog file's source. */
export function catalogJobNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/^\s+"([a-z0-9-]+)": \{/gm)) {
    names.add(match[1]);
  }
  return names;
}

/** Scheduled names the catalog does not describe, sorted. */
export function uncatalogedJobs(
  scheduled: Set<string>,
  cataloged: Set<string>,
): Array<string> {
  return [...scheduled].filter((name) => !cataloged.has(name)).sort();
}

/** Reads the migrations and catalog files under `root`; exits 1 on a gap. */
function runGuard(root: string): void {
  const scheduled = namesFromFiles(
    join(root, "supabase", "migrations"),
    (file) => file.endsWith(".sql"),
    scheduledJobNames,
  );
  const cataloged = namesFromFiles(
    join(root, "src", "lib"),
    (file) => /^cronJobsCatalog\w*\.ts$/.test(file),
    catalogJobNames,
  );
  const missing = uncatalogedJobs(scheduled, cataloged);
  if (missing.length) {
    console.error(`Cron jobs with no catalog entry: ${missing.join(", ")}`);
    console.error("Describe them in src/lib/cronJobsCatalog*.ts.");
    process.exit(1);
  }
  console.log(`Cron catalog: all ${scheduled.size} scheduled jobs described.`);
}

/** The names `extract` finds in every matching file of `dir`. */
function namesFromFiles(
  dir: string,
  matches: (file: string) => boolean,
  extract: (text: string) => Set<string>,
): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(dir).filter(matches)) {
    for (const name of extract(readFileSync(join(dir, file), "utf8"))) {
      names.add(name);
    }
  }
  return names;
}
