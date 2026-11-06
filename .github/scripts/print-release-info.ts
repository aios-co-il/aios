import { readFileSync } from "node:fs";
import { buildReleaseNotes } from "./release-notes.ts";
import { nextVersion, type Bump } from "./release-version.ts";

// Usage:
//   node .github/scripts/print-release-info.ts version <latest-tag-or-empty> <patch|minor|major>
//   git log --format=%s origin/main..origin/develop | node .github/scripts/print-release-info.ts notes <version> [notes-file]
const [, , command, ...args] = process.argv;

if (command === "version") {
  const [latestTag = "", bump] = args;
  if (bump !== "patch" && bump !== "minor" && bump !== "major") {
    console.error("::error::bump must be patch, minor or major");
    process.exit(1);
  }
  process.stdout.write(nextVersion(latestTag, bump satisfies Bump));
} else if (command === "notes") {
  const [version, notesPath] = args;
  const subjects = readFileSync(0, "utf8").split("\n").filter(Boolean);
  const notes = notesPath ? readFileSync(notesPath, "utf8") : undefined;
  process.stdout.write(buildReleaseNotes({ version, subjects, notes }));
} else {
  console.error("::error::usage: print-release-info.ts version|notes ...");
  process.exit(1);
}
