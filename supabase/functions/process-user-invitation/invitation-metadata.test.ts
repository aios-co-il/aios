import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import { parseInvitationMetadata } from "./invitation-metadata.ts";

Deno.test(
  "reads string and string-list fields from invitation metadata",
  () => {
    const parsed = parseInvitationMetadata({
      fullName: "Dana",
      role: "campaigner",
      agencyIds: ["a1", 7, "a2"],
      modulePermissions: ["crm"],
      campaignerId: "c1",
    });
    assertEquals(parsed, {
      fullName: "Dana",
      role: "campaigner",
      agencyIds: ["a1", "a2"],
      modulePermissions: ["crm"],
      campaignerId: "c1",
      salesPersonId: undefined,
    });
  },
);

Deno.test("drops non-string values", () => {
  const parsed = parseInvitationMetadata({ role: 3, agencyIds: "a1" });
  assertStrictEquals(parsed.role, undefined);
  assertStrictEquals(parsed.agencyIds, undefined);
});

Deno.test("throws when metadata is missing", () => {
  assertThrows(() => parseInvitationMetadata(null), TypeError);
});
