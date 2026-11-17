import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { handleUnsubscribe, type UnsubscribeStore } from "./handler.ts";

const ID = "6f1c2b9e-3d4a-4e5f-8a7b-1c2d3e4f5a6b";
const FN = "https://x.supabase.co/functions/v1/broadcast-unsubscribe";
const APP = "https://aios.co.il";

/** Store with one recipient (ID) in tenant pdpsagot; records unsubscribes. */
function fakeStore(fail = false) {
  const unsubscribed: Array<string> = [];
  const store: UnsubscribeStore = {
    tenantOf(id) {
      if (fail) {
        return Promise.reject(new Error("db down"));
      }
      return Promise.resolve(
        id === ID ? { name: "פדפ שגות", slug: "pdpsagot" } : null,
      );
    },
    unsubscribe(id) {
      if (fail) {
        return Promise.reject(new Error("db down"));
      }
      if (id !== ID) {
        return Promise.resolve(null);
      }
      unsubscribed.push(id);
      return Promise.resolve({ tenantName: "פדפ שגות" });
    },
  };
  return { store, unsubscribed };
}

/** Run one request against a fresh fake store. */
async function run(req: Request, fail = false) {
  const { store, unsubscribed } = fakeStore(fail);
  const res = await handleUnsubscribe(req, { store, appUrl: APP });
  return { res, unsubscribed };
}

/** POST with a JSON body, as the app page sends it. */
function postJson(body: unknown) {
  return new Request(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handleUnsubscribe", () => {
  it("OPTIONS answers CORS preflight", async () => {
    const { res } = await run(new Request(FN, { method: "OPTIONS" }));
    assertStrictEquals(res.status, 204);
    assertStrictEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  it("JSON POST unsubscribes and names the tenant only", async () => {
    const { res, unsubscribed } = await run(postJson({ r: ID }));
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(await res.json(), { ok: true, tenant_name: "פדפ שגות" });
    assertEquals(unsubscribed, [ID]);
  });

  it("JSON POST for an unknown recipient is 404", async () => {
    const { res } = await run(
      postJson({ r: "00000000-0000-4000-8000-000000000000" }),
    );
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), { ok: false, error: "not_found" });
  });

  it("JSON POST with an invalid id is 400", async () => {
    for (const body of [{ r: "nope" }, {}, "not-an-object"]) {
      const { res, unsubscribed } = await run(postJson(body));
      assertStrictEquals(res.status, 400);
      assertEquals(await res.json(), { ok: false, error: "invalid_link" });
      assertEquals(unsubscribed, []);
    }
  });

  it("store failure is a generic 500", async () => {
    const { res } = await run(postJson({ r: ID }), true);
    assertStrictEquals(res.status, 500);
    assertEquals(await res.json(), { ok: false, error: "internal_error" });
  });

  it("reports success when the opt-out is recorded but the name is not", async () => {
    const store: UnsubscribeStore = {
      tenantOf: () => Promise.resolve(null),
      unsubscribe: () => Promise.resolve({ tenantName: null }),
    };
    const res = await handleUnsubscribe(postJson({ r: ID }), {
      store,
      appUrl: APP,
    });
    assertStrictEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true, tenant_name: null });
  });

  it("GET info=1 names the tenant without unsubscribing", async () => {
    const { res, unsubscribed } = await run(
      new Request(`${FN}?r=${ID}&info=1`),
    );
    assertStrictEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true, tenant_name: "פדפ שגות" });
    assertEquals(unsubscribed, []);
  });

  it("GET info=1 unknown recipient is 404", async () => {
    const { res } = await run(
      new Request(`${FN}?r=00000000-0000-4000-8000-000000000000&info=1`),
    );
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), { ok: false, error: "not_found" });
  });

  it("a link from an old mailing redirects to the app page", async () => {
    const { res, unsubscribed } = await run(new Request(`${FN}?r=${ID}`));
    assertStrictEquals(res.status, 302);
    assertStrictEquals(
      res.headers.get("Location"),
      `${APP}/unsubscribe/pdpsagot?r=${ID}`,
    );
    assertEquals(unsubscribed, []);
  });

  it("one-click POST without JSON unsubscribes", async () => {
    const { res, unsubscribed } = await run(
      new Request(`${FN}?r=${ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );
    assertStrictEquals(res.status, 200);
    assertEquals(unsubscribed, [ID]);
  });

  it("other methods are refused without unsubscribing", async () => {
    const { res, unsubscribed } = await run(
      new Request(`${FN}?r=${ID}`, { method: "DELETE" }),
    );
    assertStrictEquals(res.status, 405);
    assertEquals(unsubscribed, []);
  });
});
