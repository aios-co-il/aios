import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { resolveTargetEntity } from "./target.ts";

Deno.test("resolveTargetEntity picks the trigger's lead or client", () => {
  assertEquals(resolveTargetEntity({}, { id: "L1" }, "lead_status_changed"), {
    type: "lead",
    id: "L1",
  });
  assertEquals(resolveTargetEntity({}, { id: "C1" }, "client_status_changed"), {
    type: "client",
    id: "C1",
  });
  assertEquals(
    resolveTargetEntity(
      { entity: "client" },
      { id: "L1", client_id: "C9" },
      "lead_status_changed",
    ),
    { type: "client", id: "C9" },
  );
  assertStrictEquals(
    resolveTargetEntity({ entity: "client" }, { id: "L1" }, "lead_created"),
    null,
  );
});
