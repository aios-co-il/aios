import { isNonProductionAppEnv } from "../../app-env.ts";
import { githubLandingRepo, type LandingRepo } from "./repo.ts";

/** The repository Carmen builds pages in, unless LANDING_PAGES_REPO names another. */
const DEFAULT_REPO = "aios-co-il/landing-pages";

/**
 * The repository from the function's secrets. Undefined when its token is not set, and outside
 * Production (APP_ENV unset counts as Production, see app-env.ts): Staging blocks calls to GitHub
 * (staging-outbound.mjs), and a page built from Staging data must never reach the live repository.
 */
export function landingRepoFromEnv(
  env: (name: string) => string | undefined,
): LandingRepo | undefined {
  const token = env("LANDING_PAGES_GITHUB_TOKEN");
  if (!token || isNonProductionAppEnv(env("APP_ENV"))) {
    return undefined;
  }
  return githubLandingRepo({
    token,
    repo: env("LANDING_PAGES_REPO") || DEFAULT_REPO,
  });
}
