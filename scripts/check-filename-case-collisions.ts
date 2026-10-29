// Fails when two tracked paths differ only in letter case. Linux accepts both,
// but macOS and Windows resolve imports to the wrong file and break the typecheck.
import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const byLowercase = new Map<string, string[]>();
for (const path of tracked) {
  const key = path.toLowerCase();
  byLowercase.set(key, [...(byLowercase.get(key) ?? []), path]);
}

const collisions = [...byLowercase.values()].filter(
  (paths) => paths.length > 1,
);

if (collisions.length > 0) {
  for (const paths of collisions) {
    console.error(`Paths differ only in case: ${paths.join(" | ")}`);
  }
  process.exit(1);
}
