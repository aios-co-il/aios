import assert from "node:assert/strict";
import test from "node:test";
import { resolveTargetEntity } from "./target.ts";

test("resolveTargetEntity picks the trigger's lead or client", () => {
  assert.deepEqual(
    resolveTargetEntity({}, { id: "L1" }, "lead_status_changed"),
    {
      type: "lead",
      id: "L1",
    },
  );
  assert.deepEqual(
    resolveTargetEntity({}, { id: "C1" }, "client_status_changed"),
    {
      type: "client",
      id: "C1",
    },
  );
  assert.deepEqual(
    resolveTargetEntity(
      { entity: "client" },
      { id: "L1", client_id: "C9" },
      "lead_status_changed",
    ),
    { type: "client", id: "C9" },
  );
  assert.equal(
    resolveTargetEntity({ entity: "client" }, { id: "L1" }, "lead_created"),
    null,
  );
});
