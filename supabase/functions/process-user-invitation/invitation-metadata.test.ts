import assert from "node:assert/strict";
import test from "node:test";
import { parseInvitationMetadata } from "./invitation-metadata.ts";

test("reads string and string-list fields from invitation metadata", () => {
  const parsed = parseInvitationMetadata({
    fullName: "Dana",
    role: "campaigner",
    agencyIds: ["a1", 7, "a2"],
    modulePermissions: ["crm"],
    campaignerId: "c1",
  });
  assert.deepEqual(parsed, {
    fullName: "Dana",
    role: "campaigner",
    agencyIds: ["a1", "a2"],
    modulePermissions: ["crm"],
    campaignerId: "c1",
    salesPersonId: undefined,
  });
});

test("drops non-string values", () => {
  const parsed = parseInvitationMetadata({ role: 3, agencyIds: "a1" });
  assert.equal(parsed.role, undefined);
  assert.equal(parsed.agencyIds, undefined);
});

test("throws when metadata is missing", () => {
  assert.throws(() => parseInvitationMetadata(null), TypeError);
});
