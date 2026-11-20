import { assertEquals } from "jsr:@std/assert@1";
import {
  handleLandingDomain,
  type LandingDomainDeps,
  NOT_PRODUCTION,
} from "./handler.ts";
import type { SiteDomainState, SiteDomainStore } from "./site-store.ts";
import {
  type DomainCheck,
  DomainInUseError,
  VercelApiError,
  type VercelLanding,
} from "./vercel.ts";

const ITEM = "6f1d2b3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const SITE = { siteId: "site-1", tenantId: "tenant-1" };
const NOW = new Date("2026-11-20T10:00:00Z");

/** A fake site row and Vercel project, recording what the handler does to them. */
function setup(
  state: Partial<SiteDomainState>,
  options: {
    check?: DomainCheck;
    claimed?: Array<string>;
    addError?: Error;
  } = {},
) {
  const row: SiteDomainState = {
    customDomain: null,
    vercelDomain: null,
    verifiedAt: null,
    ...state,
  };
  const vercelCalls: Array<string> = [];
  const vercel: VercelLanding = {
    addDomain: (domain) => {
      vercelCalls.push(`add ${domain}`);
      return options.addError
        ? Promise.reject(options.addError)
        : Promise.resolve();
    },
    removeDomain: (domain) => {
      vercelCalls.push(`remove ${domain}`);
      return Promise.resolve();
    },
    checkDomain: (domain) => {
      vercelCalls.push(`check ${domain}`);
      return Promise.resolve(
        options.check ?? { connected: true, verified: false, records: [] },
      );
    },
  };
  const store: SiteDomainStore = {
    read: () => Promise.resolve({ ...row }),
    domainClaimed: (domain) =>
      Promise.resolve((options.claimed ?? []).includes(domain)),
    recordAttached: (_site, domain) => {
      row.vercelDomain = domain;
      return Promise.resolve();
    },
    recordVerification: (_site, domain, verifiedAt) => {
      if (row.customDomain === domain) {
        row.verifiedAt = verifiedAt;
      }
      return Promise.resolve();
    },
  };
  const deps: LandingDomainDeps = {
    vercel,
    siteOfProject: (itemId) =>
      Promise.resolve(itemId === ITEM ? SITE : { error: "אין גישה" }),
    store,
    now: () => NOW,
  };
  return { deps, row, vercelCalls };
}

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

Deno.test(
  "Vercel failures answer with a reason and record nothing",
  async () => {
    const inUse = setup(
      { customDomain: "lp.exsitu.co.il" },
      { addError: new DomainInUseError("lp.exsitu.co.il") },
    );
    const refused = await handleLandingDomain(
      { action: "connect", item_id: ITEM },
      inUse.deps,
    );
    assertEquals(refused.status, 409);
    assertEquals(inUse.row.vercelDomain, null);

    const down = setup(
      { customDomain: "lp.exsitu.co.il" },
      {
        addError: new VercelApiError(
          500,
          "internal",
          "/v10/projects/p/domains",
        ),
      },
    );
    const failed = await handleLandingDomain(
      { action: "connect", item_id: ITEM },
      down.deps,
    );
    assertEquals(failed.status, 502);
    assertEquals(down.row.vercelDomain, null);
  },
);
