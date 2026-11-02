import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { readAccount } from "./meta-account.ts";

const TOKEN = "EAAtoken-secret";

type Route = (url: URL) => unknown;

/** A fetch that answers each Graph path from `routes` and records the URLs. */
function fakeGraph(routes: Record<string, Route>) {
  const urls: URL[] = [];
  const fetchImpl = (raw: string) => {
    const url = new URL(raw);
    urls.push(url);
    const status = url.searchParams.get("effective_status") || "";
    const key = `${url.pathname.replace("/v21.0/", "")}${status ? ` ${status}` : ""}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected ${key}`);
    return Promise.resolve(new Response(JSON.stringify(route(url))));
  };
  return { fetchImpl, urls };
}

const healthyRoutes = (over: Record<string, Route> = {}) => ({
  act_1: () => ({ name: "Roma", account_status: 1 }),
  'act_1/campaigns ["ACTIVE","WITH_ISSUES"]': () => ({
    data: [{ id: "c1", name: "C1", effective_status: "ACTIVE" }],
  }),
  'act_1/ads ["DISAPPROVED","PENDING_BILLING_INFO"]': () => ({ data: [] }),
  'act_1/ads ["ACTIVE","PENDING_REVIEW","IN_PROCESS","PREAPPROVED"]': () => ({
    data: [{ id: "a1" }],
  }),
  ...over,
});

Deno.test("readAccount: a healthy account with a live ad", async () => {
  const graph = fakeGraph(healthyRoutes());
  const read = await readAccount("act_1", TOKEN, graph.fetchImpl);
  assert(read.ok);
  assertEquals(read.snapshot, {
    accountName: "Roma",
    accountStatus: 1,
    campaigns: [
      { id: "c1", name: "C1", effective_status: "ACTIVE", issues_count: 0 },
    ],
    blockedAds: [],
    hasLiveAd: true,
  });
  const liveCall = graph.urls.find(
    (u) =>
      u.searchParams.get("effective_status") ===
      '["ACTIVE","PENDING_REVIEW","IN_PROCESS","PREAPPROVED"]',
  );
  assertStrictEquals(liveCall?.searchParams.get("limit"), "1");
});

Deno.test("readAccount: no live ad", async () => {
  const graph = fakeGraph(
    healthyRoutes({
      'act_1/ads ["ACTIVE","PENDING_REVIEW","IN_PROCESS","PREAPPROVED"]':
        () => ({ data: [] }),
    }),
  );
  const read = await readAccount("act_1", TOKEN, graph.fetchImpl);
  assert(read.ok);
  assertStrictEquals(read.snapshot.hasLiveAd, false);
});

Deno.test("readAccount: follows campaign pages", async () => {
  const graph = fakeGraph(
    healthyRoutes({
      'act_1/campaigns ["ACTIVE","WITH_ISSUES"]': (url) =>
        url.searchParams.get("after")
          ? { data: [{ id: "c2", effective_status: "WITH_ISSUES" }] }
          : {
              data: [{ id: "c1", effective_status: "ACTIVE" }],
              paging: {
                next: `${url.origin}${url.pathname}?effective_status=${encodeURIComponent('["ACTIVE","WITH_ISSUES"]')}&after=x`,
              },
            },
    }),
  );
  const read = await readAccount("act_1", TOKEN, graph.fetchImpl);
  assert(read.ok);
  assertEquals(
    read.snapshot.campaigns.map((c) => c.id),
    ["c1", "c2"],
  );
});

Deno.test(
  "readAccount: any failed call fails the read, without the token",
  async () => {
    const graph = fakeGraph(
      healthyRoutes({
        'act_1/ads ["ACTIVE","PENDING_REVIEW","IN_PROCESS","PREAPPROVED"]':
          () => ({
            error: { message: "(#17) User request limit reached" },
          }),
      }),
    );
    const read = await readAccount("act_1", TOKEN, graph.fetchImpl);
    assert(!read.ok);
    assertStrictEquals(read.error, "Graph: (#17) User request limit reached");
    assertStrictEquals(read.error.includes(TOKEN), false);
  },
);

Deno.test("readAccount: a missing account_status fails the read", async () => {
  const graph = fakeGraph(healthyRoutes({ act_1: () => ({ name: "Roma" }) }));
  const read = await readAccount("act_1", TOKEN, graph.fetchImpl);
  assert(!read.ok);
});
