import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoActionTool } from "./execute.ts";
import {
  CLIENT_ID,
  TENANT,
  actionCtx,
  clientRow,
  fakeActionDb,
} from "./fake-db.test-fixture.ts";

const serpapi = {
  tenant_id: TENANT,
  integration_type: "serpapi",
  is_active: true,
};

/** Runs check_serp_rankings on a seed. */
async function check(
  args: Record<string, unknown>,
  seed: Record<string, Array<Record<string, unknown>>> = {
    tenant_integrations: [serpapi],
  },
  options: Parameters<typeof actionCtx>[0] = {},
) {
  const db = fakeActionDb({ clients: [clientRow()], ...seed });
  const { ctx, invocations } = actionCtx(options);
  const result = await executeSeoActionTool(db, ctx, "check_serp_rankings", {
    client_id: CLIENT_ID,
    ...args,
  });
  return { db, result, invocations };
}

Deno.test("phrases, market and device are validated", async () => {
  const many = Array.from({ length: 11 }, (_, i) => `ביטוי ${i}`);
  for (const args of [
    { keywords: [] },
    { keywords: many },
    { keywords: ["a"], country: "br" },
  ]) {
    assertEquals(at((await check(args)).result, "error"), "invalid_args");
  }
});

Deno.test(
  "no search provider in the tenant says so before queueing",
  async () => {
    const { result, db } = await check({ keywords: ["שיפוץ"] }, {});
    assertEquals(at(result, "error"), "not_connected");
    assertEquals(db.writes, []);
  },
);

Deno.test("a client without a site cannot be searched", async () => {
  const db = fakeActionDb({
    clients: [clientRow({ website: null })],
    tenant_integrations: [serpapi],
  });
  const result = await executeSeoActionTool(
    db,
    actionCtx().ctx,
    "check_serp_rankings",
    {
      client_id: CLIENT_ID,
      keywords: ["שיפוץ"],
    },
  );
  assertEquals(at(result, "error"), "no_domain");
});

Deno.test("the queued check costs one paid search per phrase", async () => {
  const { result } = await check({ keywords: ["שיפוץ", "קבלן"] });
  assertEquals(at(result, "cost", "calls"), 2);
  assertEquals(at(result, "cost", "payer"), "חשבון SerpAPI של הארגון");
});

Deno.test(
  "the approved check searches each phrase for the caller's tenant",
  async () => {
    const { result, invocations } = await check(
      { keywords: ["שיפוץ", "קבלן"] },
      undefined,
      {
        approved: true,
        replies: {
          "serpapi-search": {
            ok: true,
            json: {
              success: true,
              position: 4,
              competitors: [{ domain: "a.co.il" }],
            },
          },
        },
      },
    );
    assertEquals(invocations.length, 2);
    assertEquals(at(invocations[0].body, "tenant_id"), TENANT);
    assertEquals(at(invocations[0].body, "domain"), "example.co.il");
    assertEquals(at(invocations[0].body, "language"), "he");
    assertEquals(at(result, "results", "1", "position"), 4);
  },
);

Deno.test("every search failing is an error", async () => {
  const { result } = await check({ keywords: ["שיפוץ"] }, undefined, {
    approved: true,
    replies: {
      "serpapi-search": {
        ok: false,
        json: { error: "DataForSEO not configured" },
      },
    },
  });
  assertEquals(at(result, "error"), "search_failed");
});
