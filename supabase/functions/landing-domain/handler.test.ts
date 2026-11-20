import { assertEquals } from "jsr:@std/assert@1";
import { handleLandingDomain, NOT_PRODUCTION } from "./handler.ts";
import { ITEM, NOW, setup } from "./handler.test-fixture.ts";

Deno.test(
  "connect attaches the saved domain and reports its record",
  async () => {
    const record = {
      type: "CNAME" as const,
      name: "lp",
      value: "cname.vercel-dns.com",
    };
    const { deps, row, vercelCalls } = setup(
      { customDomain: "lp.exsitu.co.il" },
      { check: { connected: true, verified: false, records: [record] } },
    );
    const reply = await handleLandingDomain(
      { action: "connect", item_id: ITEM },
      deps,
    );
    assertEquals(reply, {
      status: 200,
      body: {
        available: true,
        domain: "lp.exsitu.co.il",
        connected: true,
        verified: false,
        records: [record],
      },
    });
    assertEquals(vercelCalls, ["add lp.exsitu.co.il", "check lp.exsitu.co.il"]);
    assertEquals(row.vercelDomain, "lp.exsitu.co.il");
  },
);

Deno.test("a changed domain detaches the old one first", async () => {
  const { deps, row, vercelCalls } = setup({
    customDomain: "new.exsitu.co.il",
    vercelDomain: "old.exsitu.co.il",
  });
  await handleLandingDomain({ action: "connect", item_id: ITEM }, deps);
  assertEquals(vercelCalls.slice(0, 2), [
    "remove old.exsitu.co.il",
    "add new.exsitu.co.il",
  ]);
  assertEquals(row.vercelDomain, "new.exsitu.co.il");
});

Deno.test("a removed domain is detached and nothing is attached", async () => {
  const { deps, row, vercelCalls } = setup({ vercelDomain: "lp.exsitu.co.il" });
  const reply = await handleLandingDomain(
    { action: "connect", item_id: ITEM },
    deps,
  );
  assertEquals(vercelCalls, ["remove lp.exsitu.co.il"]);
  assertEquals(row.vercelDomain, null);
  assertEquals(reply.body, {
    available: true,
    domain: null,
    connected: false,
    verified: false,
    records: [],
  });
});

Deno.test("an old domain another site saved since stays attached", async () => {
  const { deps, vercelCalls } = setup(
    { vercelDomain: "lp.exsitu.co.il" },
    { claimed: ["lp.exsitu.co.il"] },
  );
  await handleLandingDomain({ action: "connect", item_id: ITEM }, deps);
  assertEquals(vercelCalls, []);
});

Deno.test(
  "status records the verification, and keeps its first time",
  async () => {
    const verified = { connected: true, verified: true, records: [] };
    const { deps, row, vercelCalls } = setup(
      { customDomain: "lp.exsitu.co.il", vercelDomain: "lp.exsitu.co.il" },
      { check: verified },
    );
    const reply = await handleLandingDomain(
      { action: "status", item_id: ITEM },
      deps,
    );
    assertEquals(vercelCalls, ["check lp.exsitu.co.il"]);
    assertEquals((reply.body as { verified: boolean }).verified, true);
    assertEquals(row.verifiedAt, NOW.toISOString());

    row.verifiedAt = "2026-11-01T00:00:00Z";
    await handleLandingDomain({ action: "status", item_id: ITEM }, deps);
    assertEquals(row.verifiedAt, "2026-11-01T00:00:00Z");
  },
);

Deno.test(
  "status clears the verification of a domain Vercel no longer verifies",
  async () => {
    const { deps, row } = setup(
      {
        customDomain: "lp.exsitu.co.il",
        vercelDomain: "lp.exsitu.co.il",
        verifiedAt: "2026-11-01T00:00:00Z",
      },
      { check: { connected: true, verified: false, records: [] } },
    );
    await handleLandingDomain({ action: "status", item_id: ITEM }, deps);
    assertEquals(row.verifiedAt, null);
  },
);

Deno.test(
  "status of a domain not attached yet does not call Vercel",
  async () => {
    const { deps, vercelCalls } = setup({ customDomain: "lp.exsitu.co.il" });
    const reply = await handleLandingDomain(
      { action: "status", item_id: ITEM },
      deps,
    );
    assertEquals(vercelCalls, []);
    assertEquals((reply.body as { connected: boolean }).connected, false);
  },
);

Deno.test("outside Production it answers without calling Vercel", async () => {
  const { deps } = setup({ customDomain: "lp.exsitu.co.il" });
  const reply = await handleLandingDomain(
    { action: "connect", item_id: ITEM },
    { ...deps, vercel: undefined },
  );
  assertEquals(reply, {
    status: 200,
    body: { available: false, message: NOT_PRODUCTION },
  });
});

Deno.test(
  "a caller without access to the project is refused first",
  async () => {
    const { deps, vercelCalls } = setup({ customDomain: "lp.exsitu.co.il" });
    const reply = await handleLandingDomain(
      { action: "connect", item_id: "00000000-0000-4000-8000-000000000000" },
      { ...deps, vercel: undefined },
    );
    assertEquals(reply, { status: 403, body: { error: "אין גישה" } });
    assertEquals(vercelCalls, []);
  },
);

Deno.test("a body without a valid action and item is refused", async () => {
  const { deps } = setup({});
  for (const body of [
    null,
    { action: "delete", item_id: ITEM },
    { action: "status", item_id: "not-a-uuid" },
  ]) {
    assertEquals((await handleLandingDomain(body, deps)).status, 400);
  }
});
