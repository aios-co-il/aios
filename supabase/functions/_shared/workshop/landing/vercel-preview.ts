/**
 * The preview Vercel built for a landing-pages commit, read from the landing-pages Vercel project
 * by the commit's sha. GitHub's Deployments API never listed the first Production build's
 * preview (AIO-680), so Carmen asks Vercel itself. The token is never logged.
 */

const VERCEL_API = "https://api.vercel.com";

/** One deployment as the list endpoint returns it. */
interface VercelDeployment {
  url?: string;
  state?: string;
  readyState?: string;
}

/** Returns the lookup: the preview's https address, or null while none is ready. */
export function vercelPreviewLookup(config: {
  token: string;
  projectId: string;
  teamId: string | undefined;
  fetch?: typeof fetch;
}): (commit: string) => Promise<string | null> {
  const send = config.fetch ?? fetch;
  return async (commit) => {
    const url = new URL(`${VERCEL_API}/v6/deployments`);
    url.searchParams.set("projectId", config.projectId);
    url.searchParams.set("sha", commit);
    url.searchParams.set("limit", "5");
    if (config.teamId) {
      url.searchParams.set("teamId", config.teamId);
    }
    const response = await send(url, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`vercel deployments answered ${response.status}`);
    }
    const data = (await response.json()) as {
      deployments?: Array<VercelDeployment>;
    };
    const ready = (data.deployments ?? []).find(
      (deployment) =>
        (deployment.state ?? deployment.readyState) === "READY" &&
        deployment.url,
    );
    return ready?.url ? `https://${ready.url}` : null;
  };
}
