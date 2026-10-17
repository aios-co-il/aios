import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eligibleManusGroups,
  generateVerificationCode,
  agencyVoiceNote,
  attachGroupAffiliations,
  groupsReadyToIntroduce,
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

test("intro names the linked agency and keeps the code private", () => {
  const intro = introMessage({ agencyName: "דור מדיה", clientName: "לקוח א" });
  assert.match(intro, /מנהלת השיווק הדיגיטלי של דור מדיה/);
  assert.match(intro, /לקוח א/);
  assert.equal(introMessage({ clientName: "לקוח א" }), "");
  assert.doesNotMatch(intro, /\d{6}/);
  assert.match(
    privateCodeMessage({ name: "דוד", agencyName: "דור מדיה", code: "123456" }),
    /123456/,
  );
  assert.match(
    agencyVoiceNote({ agencyName: "דור מדיה", clientName: "לקוח א" }),
    /דור מדיה/,
  );
});

test("a group is introduced only when it already has a client and an agency", () => {
  const groupId = "11111111-1111-1111-1111-111111111111";
  const clientId = "33333333-3333-3333-3333-333333333333";
  const agencyId = "44444444-4444-4444-4444-444444444444";
  const [linked] = attachGroupAffiliations(
    [{ id: groupId, group_chat_id: "team@g.us", group_name: "צוות" }],
    [{ whatsapp_group_id: groupId, client_id: clientId, agency_id: agencyId }],
    [{ id: clientId, name: "לקוח א", agency_id: agencyId }],
    [{ id: agencyId, name: "דור מדיה" }],
  );
  assert.equal(groupsReadyToIntroduce([linked]).length, 1);
  const [unlinked] = attachGroupAffiliations(
    [{ id: groupId, group_chat_id: "team@g.us" }],
    [],
    [],
    [],
  );
  assert.equal(groupsReadyToIntroduce([unlinked]).length, 0);
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

test("group code: only a short message with just the code, from the right phone", () => {
  const pendings = [
    { id: "a", code: "482913", group_chat_id: "g@g.us", phone: "972501111111" },
    { id: "b", code: "135790", group_chat_id: "g@g.us", phone: "972502222222" },
  ];
  assert.equal(matchGroupActivation("482913", pendings, "g@g.us")?.id, "a");
  assert.equal(matchGroupActivation(" 482 913 ", pendings, "g@g.us")?.id, "a");
  // Packed guesses no longer scan for any pending code.
  assert.equal(
    matchGroupActivation("111111 482913 135790", pendings, "g@g.us"),
    null,
  );
  assert.equal(
    matchGroupActivation(`x ${"9".repeat(60)} 482913`, pendings, "g@g.us"),
    null,
  );
  // Sender's known phone must be the one the code was sent to.
  assert.equal(
    matchGroupActivation("482913", pendings, "g@g.us", "972502222222"),
    null,
  );
  assert.equal(
    matchGroupActivation("482913", pendings, "g@g.us", "0501111111")?.id,
    "a",
  );
});
