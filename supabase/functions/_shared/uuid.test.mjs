import { assertNotStrictEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { asUuidOrNull } from "./uuid.mjs";

Deno.test("asUuidOrNull returns null for system / empty / invalid", () => {
  assertStrictEquals(asUuidOrNull("system"), null);
  assertStrictEquals(asUuidOrNull("SYSTEM"), null);
  assertStrictEquals(asUuidOrNull(""), null);
  assertStrictEquals(asUuidOrNull("   "), null);
  assertStrictEquals(asUuidOrNull(null), null);
  assertStrictEquals(asUuidOrNull(undefined), null);
  assertStrictEquals(asUuidOrNull("not-a-uuid"), null);
  assertStrictEquals(
    asUuidOrNull("00000000-0000-0000-0000-00000000000g"),
    null,
  );
});

Deno.test("asUuidOrNull accepts real UUIDs", () => {
  const id = "596286e3-f3ae-4a80-859e-bd824ed2f779";
  assertStrictEquals(asUuidOrNull(id), id);
  assertStrictEquals(asUuidOrNull(`  ${id}  `), id);
  assertStrictEquals(
    asUuidOrNull("00000000-0000-0000-0000-000000000000"),
    "00000000-0000-0000-0000-000000000000",
  );
});

Deno.test("approval payload never embeds system as requested_by", () => {
  // Mirrors the agent_approval_queue insert shape used by toggle_facebook_campaign.
  const userId = "system";
  const payload = {
    tenant_id: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
    agent_id: null,
    requested_by: asUuidOrNull(userId),
    approved_by: asUuidOrNull(userId),
    tool_name: "toggle_facebook_campaign",
  };
  assertStrictEquals(payload.requested_by, null);
  assertStrictEquals(payload.approved_by, null);
  assertNotStrictEquals(payload.requested_by, "system");
});
