// Single source for the AIOS GitHub repo. Set GITHUB_REPO ("owner/name") as an
// edge-function secret.
export function getRepoSlug(): string {
  const slug = Deno.env.get("GITHUB_REPO");
  if (!slug) throw new Error("GITHUB_REPO is not set (expected owner/name)");
  return slug;
}

export function getRepoUrl(): string {
  return `https://github.com/${getRepoSlug()}`;
}
