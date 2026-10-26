import assert from "node:assert/strict";
import { test } from "node:test";
import { startProjectClient, workshopClientIdFrom } from "./view-client.ts";

const ID = "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

test("the client in view is read from the body, uuid only", () => {
  assert.equal(workshopClientIdFrom({ workshop_client_id: ID }), ID);
  assert.equal(
    workshopClientIdFrom({ workshop_client_id: ` ${ID.toUpperCase()} ` }),
    ID,
  );
  assert.equal(workshopClientIdFrom({ workshop_client_id: "all" }), null);
  assert.equal(workshopClientIdFrom({ workshop_client_id: "general" }), null);
  assert.equal(workshopClientIdFrom({ workshop_client_id: 42 }), null);
  assert.equal(workshopClientIdFrom({}), null);
});

test("a client Carmen names wins over the one in view", () => {
  assert.deepEqual(startProjectClient("c-1", ID), {
    clientId: "c-1",
    fromView: false,
  });
});

test("with no client named, the project starts for the client in view", () => {
  assert.deepEqual(startProjectClient(undefined, ID), {
    clientId: ID,
    fromView: true,
  });
  assert.deepEqual(startProjectClient("  ", ID), {
    clientId: ID,
    fromView: true,
  });
});

test("with neither, the project starts without a client", () => {
  assert.deepEqual(startProjectClient(null, null), {
    clientId: null,
    fromView: false,
  });
  assert.deepEqual(startProjectClient("", undefined), {
    clientId: null,
    fromView: false,
  });
});
