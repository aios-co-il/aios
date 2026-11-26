import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { findAutomationForMetaForm } from "./meta-form-automation.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

const firstPage = [
  { id: "alpha", name: "Alpha Sales", active: true, tenant_id: "tenant" },
  ...Array.from({ length: 99 }, (_, i) => ({
    id: `middle-${i}`,
    name: `Middle ${i}`,
    active: true,
    tenant_id: "tenant",
  })),
];
const last = {
  id: "zulu",
  name: "Zulu Sales",
  active: true,
  tenant_id: "tenant",
};

Deno.test(
  "Meta binding rejects name ambiguity beyond the first hundred candidates",
  async () => {
    const fixture = executorClient([firstPage, [last]]);
    await assertRejects(
      () =>
        findAutomationForMetaForm(
          fixture.context.supabase,
          ["tenant"],
          undefined,
          "Sales",
        ),
      Error,
      "נמצאו כמה אוטומציות",
    );
    assertEquals(fixture.calls.length, 2);
    assertEquals(
      new URL(fixture.calls[1].url).searchParams.get("or"),
      '(name.gt."Middle 98",and(name.eq."Middle 98",id.gt.middle-98))',
    );
    for (const call of fixture.calls) {
      const url = new URL(call.url);
      assertEquals(url.searchParams.get("tenant_id"), "in.(tenant)");
      assertEquals(url.searchParams.get("order"), "name.asc,id.asc");
    }
  },
);

Deno.test("Meta binding finds a unique match on a later page", async () => {
  const fixture = executorClient([firstPage, [last]]);
  assertEquals(
    await findAutomationForMetaForm(
      fixture.context.supabase,
      ["tenant"],
      undefined,
      "Zulu",
    ),
    last,
  );
});

Deno.test(
  "Meta binding retains ID filtering without scanning other flows",
  async () => {
    const fixture = executorClient([[last]]);
    assertEquals(
      await findAutomationForMetaForm(
        fixture.context.supabase,
        ["tenant"],
        "zulu",
      ),
      last,
    );
    assertEquals(fixture.calls.length, 1);
    assertEquals(
      new URL(fixture.calls[0].url).searchParams.get("id"),
      "eq.zulu",
    );
  },
);

Deno.test(
  "Meta binding does not accept an apparent match when a later page fails",
  async () => {
    const fixture = executorClient([
      firstPage,
      new Response(JSON.stringify({ message: "page failed" }), { status: 500 }),
    ]);
    await assertRejects(() =>
      findAutomationForMetaForm(
        fixture.context.supabase,
        ["tenant"],
        undefined,
        "Alpha",
      ),
    );
  },
);

Deno.test("overlapping pages count the same automation only once", async () => {
  const fixture = executorClient([firstPage, [firstPage[0]]]);
  assertEquals(
    await findAutomationForMetaForm(
      fixture.context.supabase,
      ["tenant"],
      undefined,
      "Alpha",
    ),
    firstPage[0],
  );
  assertEquals(fixture.calls.length, 2);
});

Deno.test(
  "overlapping pages still reject distinct matching automations",
  async () => {
    const fixture = executorClient([firstPage, [firstPage[0], last]]);
    await assertRejects(
      () =>
        findAutomationForMetaForm(
          fixture.context.supabase,
          ["tenant"],
          undefined,
          "Sales",
        ),
      Error,
      "נמצאו כמה אוטומציות",
    );
  },
);

Deno.test(
  "deleting an already-read flow cannot shift a second match past the cursor",
  async () => {
    let requests = 0;
    const fixture = executorClient([], 200, {}, undefined, (url) => {
      if (++requests === 1) {
        return firstPage;
      }
      return url.searchParams.has("offset") ? [] : [last];
    });
    await assertRejects(
      () =>
        findAutomationForMetaForm(
          fixture.context.supabase,
          ["tenant"],
          undefined,
          "Sales",
        ),
      Error,
      "נמצאו כמה אוטומציות",
    );
    assertEquals(requests, 2);
  },
);
