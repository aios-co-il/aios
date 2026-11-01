import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { startProjectClient, workshopClientIdFrom } from "./view-client.ts";

const ID = "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

Deno.test("the client in view is read from the body, uuid only", () => {
  assertStrictEquals(workshopClientIdFrom({ workshop_client_id: ID }), ID);
  assertStrictEquals(
    workshopClientIdFrom({ workshop_client_id: ` ${ID.toUpperCase()} ` }),
    ID,
  );
  assertStrictEquals(workshopClientIdFrom({ workshop_client_id: "all" }), null);
  assertStrictEquals(
    workshopClientIdFrom({ workshop_client_id: "general" }),
    null,
  );
  assertStrictEquals(workshopClientIdFrom({ workshop_client_id: 42 }), null);
  assertStrictEquals(workshopClientIdFrom({}), null);
});

Deno.test("a client Carmen names wins over the one in view", () => {
  assertEquals(startProjectClient("c-1", ID), {
    clientId: "c-1",
    fromView: false,
  });
});

Deno.test(
  "with no client named, the project starts for the client in view",
  () => {
    assertEquals(startProjectClient(undefined, ID), {
      clientId: ID,
      fromView: true,
    });
    assertEquals(startProjectClient("  ", ID), {
      clientId: ID,
      fromView: true,
    });
  },
);

Deno.test("with neither, the project starts without a client", () => {
  assertEquals(startProjectClient(null, null), {
    clientId: null,
    fromView: false,
  });
  assertEquals(startProjectClient("", undefined), {
    clientId: null,
    fromView: false,
  });
});
