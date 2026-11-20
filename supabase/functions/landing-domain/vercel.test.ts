import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  DomainInUseError,
  VercelApiError,
  vercelLanding,
  vercelLandingFromEnv,
} from "./vercel.ts";

/** A fake Vercel API: answers by "METHOD path" and records each call. */
function fakeVercel(answers: Record<string, [number, unknown]>) {
  const calls: Array<{ method: string; url: URL; auth: string | null }> = [];
  /** Answers one request from the table. */
  function fetchImpl(input: string | URL | Request, init?: RequestInit) {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url,
      auth: new Headers(init?.headers).get("Authorization"),
    });
    const [status, body] = answers[`${method} ${url.pathname}`] ?? [
      500,
      { error: { code: "unexpected" } },
    ];
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }
  const vercel = vercelLanding({
    token: "tok",
    projectId: "prj_1",
    teamId: "team_1",
    fetch: fetchImpl,
  });
  return { vercel, calls };
}

const DOMAIN_PATH = "/v9/projects/prj_1/domains/lp.exsitu.co.il";
const CONFIG_PATH = "/v6/domains/lp.exsitu.co.il/config";

Deno.test("vercelLandingFromEnv", async (t) => {
  /** An env reader over fixed values. */
  function env(values: Record<string, string>) {
    return (name: string) => values[name];
  }
  const secrets = {
    VERCEL_LANDING_TOKEN: "tok",
    VERCEL_LANDING_PROJECT_ID: "prj_1",
    VERCEL_LANDING_TEAM_ID: "team_1",
  };

  await t.step("Production with its secrets gets the project", () => {
    assertEquals(typeof vercelLandingFromEnv(env(secrets), fetch), "object");
  });

  await t.step("outside Production there is no project, secrets or not", () => {
    for (const appEnv of ["staging", "preview", "development"]) {
      assertEquals(
        vercelLandingFromEnv(env({ ...secrets, APP_ENV: appEnv }), fetch),
        undefined,
      );
    }
  });

  await t.step("a missing token or project leaves it unavailable", () => {
    assertEquals(
      vercelLandingFromEnv(env({ VERCEL_LANDING_PROJECT_ID: "prj_1" }), fetch),
      undefined,
    );
    assertEquals(
      vercelLandingFromEnv(env({ VERCEL_LANDING_TOKEN: "tok" }), fetch),
      undefined,
    );
  });
});

Deno.test("addDomain", async (t) => {
  await t.step(
    "posts the domain to the project, with the team and token",
    async () => {
      const { vercel, calls } = fakeVercel({
        "POST /v10/projects/prj_1/domains": [200, { name: "lp.exsitu.co.il" }],
      });
      await vercel.addDomain("lp.exsitu.co.il");
      assertEquals(calls[0].url.searchParams.get("teamId"), "team_1");
      assertEquals(calls[0].auth, "Bearer tok");
    },
  );

  await t.step(
    "a domain this project already has counts as added",
    async () => {
      const { vercel } = fakeVercel({
        "POST /v10/projects/prj_1/domains": [
          409,
          { error: { code: "domain_already_in_use" } },
        ],
        [`GET ${DOMAIN_PATH}`]: [200, { name: "lp.exsitu.co.il" }],
      });
      await vercel.addDomain("lp.exsitu.co.il");
    },
  );

  await t.step("a domain another project has is refused", async () => {
    const { vercel } = fakeVercel({
      "POST /v10/projects/prj_1/domains": [
        409,
        { error: { code: "domain_already_in_use" } },
      ],
      [`GET ${DOMAIN_PATH}`]: [404, { error: { code: "not_found" } }],
    });
    await assertRejects(
      () => vercel.addDomain("lp.exsitu.co.il"),
      DomainInUseError,
    );
  });

  await t.step("any other failure carries its status and code", async () => {
    const { vercel } = fakeVercel({
      "POST /v10/projects/prj_1/domains": [
        400,
        { error: { code: "invalid_domain" } },
      ],
    });
    const error = await assertRejects(
      () => vercel.addDomain("lp.exsitu.co.il"),
      VercelApiError,
    );
    assertEquals([error.status, error.code], [400, "invalid_domain"]);
    assertEquals(error.message.includes("tok"), false);
  });
});

Deno.test("removeDomain treats a domain already gone as removed", async () => {
  const { vercel, calls } = fakeVercel({
    [`DELETE ${DOMAIN_PATH}`]: [404, { error: { code: "not_found" } }],
  });
  await vercel.removeDomain("lp.exsitu.co.il");
  assertEquals(calls[0].method, "DELETE");
});

Deno.test("checkDomain", async (t) => {
  await t.step("verified and configured: no records left to add", async () => {
    const { vercel } = fakeVercel({
      [`GET ${DOMAIN_PATH}`]: [
        200,
        { name: "lp.exsitu.co.il", apexName: "exsitu.co.il", verified: true },
      ],
      [`GET ${CONFIG_PATH}`]: [200, { misconfigured: false }],
    });
    assertEquals(await vercel.checkDomain("lp.exsitu.co.il"), {
      connected: true,
      verified: true,
      records: [],
    });
  });

  await t.step("misconfigured: the CNAME Vercel recommends", async () => {
    const { vercel } = fakeVercel({
      [`GET ${DOMAIN_PATH}`]: [
        200,
        { name: "lp.exsitu.co.il", apexName: "exsitu.co.il", verified: true },
      ],
      [`GET ${CONFIG_PATH}`]: [
        200,
        {
          misconfigured: true,
          recommendedCNAME: [
            { rank: 2, value: "cname.vercel-dns.com." },
            { rank: 1, value: "abc123.vercel-dns-017.com." },
          ],
        },
      ],
    });
    assertEquals(await vercel.checkDomain("lp.exsitu.co.il"), {
      connected: true,
      verified: false,
      records: [
        { type: "CNAME", name: "lp", value: "abc123.vercel-dns-017.com" },
      ],
    });
  });

  await t.step(
    "a domain the project does not have is not connected",
    async () => {
      const { vercel } = fakeVercel({
        [`GET ${DOMAIN_PATH}`]: [404, { error: { code: "not_found" } }],
      });
      assertEquals(await vercel.checkDomain("lp.exsitu.co.il"), {
        connected: false,
        verified: false,
        records: [],
      });
    },
  );
});
