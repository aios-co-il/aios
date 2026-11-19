import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { landingRepoFromEnv } from "./repo-env.ts";
import { githubLandingRepo } from "./repo.ts";

type Sent = { method: string; path: string; body?: Record<string, unknown> };

/** A GitHub that answers from a script keyed by "METHOD path" and records every call. */
function fakeGitHub(script: Record<string, unknown>) {
  const sent: Array<Sent> = [];
  /** Answers one request from the script. */
  function send(url: string | URL | Request, init?: RequestInit) {
    const path = String(url).replace(
      "https://api.github.com/repos/acme/pages",
      "",
    );
    const method = init?.method ?? "GET";
    sent.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = `${method} ${path}`;
    return Promise.resolve(
      key in script
        ? new Response(JSON.stringify(script[key]), { status: 200 })
        : new Response("Not Found", { status: 404 }),
    );
  }
  const repo = githubLandingRepo({
    token: "t",
    repo: "acme/pages",
    fetch: send as typeof fetch,
  });
  return { repo, sent };
}

const base = {
  "GET ": { default_branch: "main" },
  "GET /git/ref/heads/main": { object: { sha: "main-1" } },
  "GET /git/commits/main-1": { tree: { sha: "tree-0" } },
  "POST /git/trees": { sha: "tree-1" },
  "POST /git/commits": { sha: "commit-1" },
};

Deno.test(
  "pushFiles commits on the default branch's head and creates the branch",
  async () => {
    const { repo, sent } = fakeGitHub({ ...base, "POST /git/refs": {} });
    const commit = await repo.pushFiles(
      "page/acme/home",
      { "a.json": "{}" },
      "m",
    );
    assertEquals(commit, "commit-1");
    assertEquals(sent.find((call) => call.path === "/git/commits")?.body, {
      message: "m",
      tree: "tree-1",
      parents: ["main-1"],
    });
    assertEquals(sent.at(-1), {
      method: "POST",
      path: "/git/refs",
      body: { ref: "refs/heads/page/acme/home", sha: "commit-1" },
    });
  },
);

Deno.test("pushFiles replaces a branch that already exists", async () => {
  const { repo, sent } = fakeGitHub({
    ...base,
    "GET /git/ref/heads/page/acme/home": { object: { sha: "old" } },
    "PATCH /git/refs/heads/page/acme/home": {},
  });
  await repo.pushFiles("page/acme/home", { "a.json": "{}" }, "m");
  assertEquals(sent.at(-1)?.body, { sha: "commit-1", force: true });
});

Deno.test(
  "readFile decodes UTF-8 and answers null for a missing file",
  async () => {
    const hebrew = btoa(
      String.fromCharCode(...new TextEncoder().encode('{"name":"אקמה"}')),
    );
    const { repo } = fakeGitHub({
      "GET /contents/site.json": { content: hebrew },
    });
    assertEquals(await repo.readFile("site.json"), '{"name":"אקמה"}');
    assertEquals(await repo.readFile("missing.json"), null);
  },
);

Deno.test(
  "previewUrl is the address of the commit's successful deployment",
  async () => {
    const { repo } = fakeGitHub({
      "GET /deployments?sha=c1&per_page=5": [{ id: 7 }],
      "GET /deployments/7/statuses?per_page=10": [
        { state: "pending" },
        { state: "success", environment_url: "https://preview.example" },
      ],
      "GET /deployments?sha=c2&per_page=5": [],
    });
    assertEquals(await repo.previewUrl("c1"), "https://preview.example");
    assertEquals(await repo.previewUrl("c2"), null);
  },
);

Deno.test(
  "openPull returns the branch's open pull request instead of a second one",
  async () => {
    const { repo, sent } = fakeGitHub({
      "GET /pulls?state=open&head=acme:page%2Facme%2Fhome": [
        { html_url: "https://github.example/pull/1" },
      ],
    });
    assertEquals(
      await repo.openPull("page/acme/home", "t", "b"),
      "https://github.example/pull/1",
    );
    assertEquals(
      sent.some((call) => call.method === "POST"),
      false,
    );
  },
);

Deno.test(
  "a refused call fails with GitHub's status, never silently",
  async () => {
    const { repo } = fakeGitHub({});
    await assertRejects(
      () => repo.pushFiles("page/acme/home", {}, "m"),
      Error,
      "404",
    );
  },
);

Deno.test(
  "the repository exists only in Production and only with its token",
  () => {
    /** Reads a secret from a fixed set. */
    function env(values: Record<string, string>) {
      return (name: string) => values[name];
    }
    assertEquals(landingRepoFromEnv(env({})), undefined);
    assertEquals(
      landingRepoFromEnv(
        env({ LANDING_PAGES_GITHUB_TOKEN: "t", APP_ENV: "staging" }),
      ),
      undefined,
    );
    assertEquals(
      typeof landingRepoFromEnv(env({ LANDING_PAGES_GITHUB_TOKEN: "t" })),
      "object",
    );
  },
);
