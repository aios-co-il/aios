import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eligibleManusGroups,
  generateVerificationCode,
  introMessage,
  matchGroupActivation,
  privateCodeMessage,
  relationshipNoteForIdentity,
  selectRoundGroups,
  selectRoundPhones,
} from "./carmen-group-verification.mjs";

test("group code matches only the activation issued for that group", () => {
  const code = generateVerificationCode(new Uint8Array([9, 8, 7, 6]));
  const pendings = [
    {
      id: "private",
      code: "111111",
      group_chat_id: null,
      phone: "972501111111",
    },
    { id: "other", code, group_chat_id: "other@g.us", phone: "972501111111" },
    { id: "here", code, group_chat_id: "team@g.us", phone: "972501111111" },
  ];
  assert.equal(
    matchGroupActivation(`הקוד ${code}`, pendings, "team@g.us")?.id,
    "here",
  );
  assert.equal(matchGroupActivation(code, pendings, "missing@g.us"), null);
  assert.equal(
    matchGroupActivation("972501111111", pendings, "team@g.us"),
    null,
  );
});

test("intro stays in the group and the code stays in the private message", () => {
  assert.match(introMessage("צוות"), /צוות/);
  assert.doesNotMatch(introMessage("צוות"), /\d{6}/);
  assert.match(
    privateCodeMessage({ name: "דוד", groupName: "צוות", code: "123456" }),
    /123456/,
  );
});

test("round uses approved group phones and Manus groups only", () => {
  const phones = selectRoundPhones([
    {
      phone: "972501111111",
      label: "דוד",
      surfaces: ["whatsapp_private", "whatsapp_group"],
    },
    { phone: "972502222222", surfaces: ["whatsapp_private"] },
    { phone: "972503333333", status: "revoked", surfaces: ["whatsapp_group"] },
  ]);
  assert.deepEqual(
    phones.map((row) => row.phone),
    ["972501111111"],
  );

  const manusId = "11111111-1111-1111-1111-111111111111";
  const greenId = "22222222-2222-2222-2222-222222222222";
  const groups = eligibleManusGroups({
    catalog: [{ groupChatId: "team@g.us", groupId: manusId, name: "צוות" }],
    dbRows: [
      {
        id: manusId,
        group_chat_id: "team@g.us",
        group_name: "צוות",
        description: "manus_wa_sync",
      },
      {
        id: greenId,
        group_chat_id: "ops@g.us",
        group_name: "מפעיל",
        description: null,
      },
    ],
  });
  assert.deepEqual(
    groups.map((group) => group.id),
    [manusId],
  );
  assert.deepEqual(
    selectRoundGroups(groups, {
      allowedGroupIds: [greenId],
      openMemberGroups: false,
    }),
    [],
  );
  assert.equal(
    selectRoundGroups(groups, {
      allowedGroupIds: [manusId],
      openMemberGroups: false,
    }).length,
    1,
  );
});

test("relationship note reads the approved identity and skips everyone else", () => {
  assert.match(
    relationshipNoteForIdentity({
      status: "approved",
      display_name: "דוד",
      phone: "972501111111",
      relationship_note: "דבר קצר ולעניין",
    }),
    /דבר קצר/,
  );
  assert.equal(
    relationshipNoteForIdentity({
      status: "pending",
      relationship_note: "לא להציג",
    }),
    "",
  );
});
