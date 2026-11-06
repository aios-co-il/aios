export type Bump = "patch" | "minor" | "major";

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * Returns the next release tag. `latestTag` is the newest `vX.Y.Z` tag on main,
 * or an empty string when the repository has no release tag yet (first release is v0.1.0).
 */
export function nextVersion(latestTag: string, bump: Bump): string {
  if (latestTag === "") {
    return "v0.1.0";
  }
  const match = TAG_RE.exec(latestTag);
  if (!match) {
    throw new Error(`Latest tag "${latestTag}" is not in the form vX.Y.Z`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === "major") {
    return `v${major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `v${major}.${minor + 1}.0`;
  }
  return `v${major}.${minor}.${patch + 1}`;
}
