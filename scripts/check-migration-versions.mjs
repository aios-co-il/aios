#!/usr/bin/env node
/**
 * Guard: every migration in supabase/migrations has its own version (the
 * timestamp before the first "_").
 *
 * Regression history: #920 added 20261023100000_meta_data_deletion_requests.sql
 * while #926 had already shipped 20261023100000_carmen_brain_connections.sql.
 * Each branch passed on its own; on develop the second file failed with a
 * duplicate schema_migrations key, so Staging and every Preview branch stopped
 * at the migration step (fixed in #996).
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Versions used by more than one migration file, with those files. */
export function duplicateMigrationVersions(fileNames) {
  const byVersion = new Map();
  for (const name of fileNames) {
    if (!name.endsWith(".sql")) continue;
    const version = name.split("_")[0];
    byVersion.set(version, [...(byVersion.get(version) || []), name]);
  }
  return [...byVersion.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([version, names]) => ({ version, names: names.sort() }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "supabase", "migrations");
  const duplicates = duplicateMigrationVersions(readdirSync(dir));
  if (duplicates.length) {
    for (const { version, names } of duplicates) {
      console.error(
        `Migration version ${version} is used by: ${names.join(", ")}`,
      );
    }
    console.error("Give the newer migration a later timestamp.");
    process.exit(1);
  }
  console.log("Migration versions: all unique.");
}
