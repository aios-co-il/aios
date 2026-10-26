import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  normalizeObservedPhone,
  pickCandidateStatus,
} from "./carmen-observe-group-member.mjs";

Deno.test("normalizeObservedPhone drops group JID digits", () => {
  assertStrictEquals(
    normalizeObservedPhone("120363420913931305", "120363420913931305@g.us"),
    null,
  );
});

Deno.test("normalizeObservedPhone keeps real mobile", () => {
  assertStrictEquals(
    normalizeObservedPhone("972546656303@c.us", "120363420913931305@g.us"),
    "972546656303",
  );
});

Deno.test("pickCandidateStatus links known staff", () => {
  assertStrictEquals(
    pickCandidateStatus({
      phone: "972546656303",
      matchedIdentity: { id: "1" },
      matchedCampaigner: null,
    }),
    "approved",
  );
  assertStrictEquals(
    pickCandidateStatus({
      phone: "972599999999",
      matchedIdentity: null,
      matchedCampaigner: null,
    }),
    "awaiting_approval",
  );
  assertStrictEquals(
    pickCandidateStatus({
      phone: null,
      matchedIdentity: null,
      matchedCampaigner: null,
    }),
    "awaiting_identity",
  );
});
