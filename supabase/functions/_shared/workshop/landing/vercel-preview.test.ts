import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { landingRepoFromEnv } from "./repo-env.ts";
import { vercelPreviewLookup } from "./vercel-preview.ts";

/** A Vercel that answers every deployments list with `body` and records the asked URLs. */
function fakeVercel(body: unknown, status = 200) {
  const asked: Array<URL> = [];
  /** Answers one request with the scripted body. */
  function send(url: string | URL | Request) {
    asked.push(new URL(String(url)));
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }
  return { asked, send: send as typeof fetch };
}

Deno.test(
  "the preview is the commit's ready deployment on the project",
  async () => {
    const vercel = fakeVercel({
      deployments: [
        { url: "pages-old.vercel.app", state: "BUILDING" },
        { url: "pages-6qkcpvxeg.vercel.app", state: "READY" },
      ],
    });
    const lookup = vercelPreviewLookup({
      token: "t",
      projectId: "prj_1",
      teamId: "team_1",
      fetch: vercel.send,
    });
    assertEquals(await lookup("88cd5b3"), "https://pages-6qkcpvxeg.vercel.app");
    const asked = vercel.asked[0];
    assertEquals(asked.pathname, "/v6/deployments");
    assertEquals(asked.searchParams.get("projectId"), "prj_1");
    assertEquals(asked.searchParams.get("sha"), "88cd5b3");
    assertEquals(asked.searchParams.get("teamId"), "team_1");
  },
);

Deno.test("no ready deployment yet reads as still building", async () => {
  const lookup = vercelPreviewLookup({
    token: "t",
    projectId: "prj_1",
    teamId: undefined,
    fetch: fakeVercel({
      deployments: [{ url: "x.vercel.app", state: "QUEUED" }],
    }).send,
  });
  assertEquals(await lookup("abc"), null);
});

Deno.test("a refused lookup fails loudly instead of waiting", async () => {
  const lookup = vercelPreviewLookup({
    token: "t",
    projectId: "prj_1",
    teamId: undefined,
    fetch: fakeVercel({ error: { code: "forbidden" } }, 403).send,
  });
  await assertRejects(() => lookup("abc"), Error, "403");
});

Deno.test(
  "the repository reads previews from Vercel when its secrets are set",
  async () => {
    const vercel = fakeVercel({
      deployments: [{ url: "pages-1.vercel.app", state: "READY" }],
    });
    const original = globalThis.fetch;
    globalThis.fetch = vercel.send;
    try {
      const repo = landingRepoFromEnv(
        (name) =>
          ({
            LANDING_PAGES_GITHUB_TOKEN: "g",
            VERCEL_LANDING_TOKEN: "v",
            VERCEL_LANDING_PROJECT_ID: "prj_1",
          })[name],
      );
      assertEquals(await repo?.previewUrl("abc"), "https://pages-1.vercel.app");
      assertEquals(vercel.asked[0].host, "api.vercel.com");
    } finally {
      globalThis.fetch = original;
    }
  },
);
