import { assertStrictEquals } from "jsr:@std/assert@1";
import { normalizeManusGroupsPayload } from "./manus-wa-groups.mjs";

Deno.test("normalizeManusGroupsPayload: standard groups array", () => {
  const out = normalizeManusGroupsPayload({
    groups: [{ id: "120363@g.us", name: "Ops", participantsCount: 5 }],
  });
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0].id, "120363@g.us");
  assertStrictEquals(out[0].name, "Ops");
});

Deno.test("normalizeManusGroupsPayload: nested data.groups", () => {
  const out = normalizeManusGroupsPayload({
    data: { groups: [{ jid: "99@g.us", subject: "Client" }] },
  });
  assertStrictEquals(out[0].id, "99@g.us");
  assertStrictEquals(out[0].name, "Client");
});

Deno.test("normalizeManusGroupsPayload: filters non-group ids", () => {
  const out = normalizeManusGroupsPayload({
    groups: [
      { id: "972501234567@c.us", name: "private" },
      { id: "1@g.us", name: "g" },
    ],
  });
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0].id, "1@g.us");
});

Deno.test(
  "normalizeManusGroupsPayload: Manus subject + participantCount shape",
  () => {
    const out = normalizeManusGroupsPayload({
      success: true,
      instanceId: "YwIn7GY3Ul3OAxXG",
      groups: [
        {
          id: "120363423897814166@g.us",
          subject: "PPC - DMM",
          participantCount: 7,
        },
      ],
    });
    assertStrictEquals(out.length, 1);
    assertStrictEquals(out[0].name, "PPC - DMM");
    assertStrictEquals(out[0].participantsCount, 7);
  },
);
