/**
 * The landing-pages repository (aios-co-il/landing-pages) as Carmen uses it: she writes a page's
 * files to the page's own branch, reads the preview Vercel builds for it, and opens the pull
 * request that publishes it. The repository's CI decides what merges; she never merges.
 */

export interface LandingRepo {
  /** A file on the default branch, or null when it is not there. */
  readFile(path: string): Promise<string | null>;
  /** Puts `files` on `branch` as one commit on top of the default branch; returns the commit. */
  pushFiles(
    branch: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string>;
  /** The address of the preview built for `commit`, or null while it is still building. */
  previewUrl(commit: string): Promise<string | null>;
  /** The branch's open pull request, opened now when there is none; returns its address. */
  openPull(branch: string, title: string, body: string): Promise<string>;
}

type Fetch = typeof fetch;

/** The repository over GitHub's REST API. `repo` is "owner/name". */
export function githubLandingRepo(options: {
  token: string;
  repo: string;
  fetch?: Fetch;
}): LandingRepo {
  const { token, repo } = options;
  const send = options.fetch ?? fetch;
  const owner = repo.split("/")[0];

  /** One API call; throws with GitHub's status and message on anything but 2xx or an allowed 404. */
  async function call(
    method: string,
    path: string,
    body?: unknown,
    allowMissing = false,
  ): Promise<Record<string, unknown> | Array<Record<string, unknown>> | null> {
    const response = await send(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aios-carmen",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 404 && allowMissing) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`GitHub ${method} ${path}: ${response.status} ${detail}`);
    }
    return await response.json();
  }

  /** The default branch's name and its head commit. */
  async function base(): Promise<{ branch: string; commit: string }> {
    const info = (await call("GET", "")) as Record<string, unknown>;
    const branch = String(info.default_branch);
    const ref = (await call("GET", `/git/ref/heads/${branch}`)) as {
      object: { sha: string };
    };
    return { branch, commit: ref.object.sha };
  }

  return {
    async readFile(path) {
      const file = (await call(
        "GET",
        `/contents/${path}`,
        undefined,
        true,
      )) as { content?: string } | null;
      if (!file || typeof file.content !== "string") {
        return null;
      }
      const bytes = Uint8Array.from(
        atob(file.content.replace(/\s/g, "")),
        (c) => c.charCodeAt(0),
      );
      return new TextDecoder().decode(bytes);
    },

    async pushFiles(branch, files, message) {
      const head = await base();
      const parent = (await call("GET", `/git/commits/${head.commit}`)) as {
        tree: { sha: string };
      };
      const tree = (await call("POST", "/git/trees", {
        base_tree: parent.tree.sha,
        tree: Object.entries(files).map(([path, content]) => ({
          path,
          mode: "100644",
          type: "blob",
          content,
        })),
      })) as { sha: string };
      const commit = (await call("POST", "/git/commits", {
        message,
        tree: tree.sha,
        parents: [head.commit],
      })) as { sha: string };
      // The branch is Carmen's own and holds exactly this one commit, so it is replaced, not
      // merged: a page branch never carries an older build or falls behind the default branch.
      const existing = await call(
        "GET",
        `/git/ref/heads/${branch}`,
        undefined,
        true,
      );
      await (existing
        ? call("PATCH", `/git/refs/heads/${branch}`, {
            sha: commit.sha,
            force: true,
          })
        : call("POST", "/git/refs", {
            ref: `refs/heads/${branch}`,
            sha: commit.sha,
          }));
      return commit.sha;
    },

    async previewUrl(commit) {
      const deployments = (await call(
        "GET",
        `/deployments?sha=${commit}&per_page=5`,
      )) as Array<{ id: number }>;
      for (const deployment of deployments) {
        const statuses = (await call(
          "GET",
          `/deployments/${deployment.id}/statuses?per_page=10`,
        )) as Array<{ state?: string; environment_url?: string }>;
        const ready = statuses.find(
          (status) => status.state === "success" && status.environment_url,
        );
        if (ready?.environment_url) {
          return ready.environment_url;
        }
      }
      return null;
    },

    async openPull(branch, title, body) {
      const open = (await call(
        "GET",
        `/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`,
      )) as Array<{ html_url: string }>;
      if (open.length > 0) {
        return open[0].html_url;
      }
      const head = await base();
      const made = (await call("POST", "/pulls", {
        title,
        body,
        head: branch,
        base: head.branch,
      })) as { html_url: string };
      return made.html_url;
    },
  };
}
