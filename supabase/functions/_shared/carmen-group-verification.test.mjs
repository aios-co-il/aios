import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
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

Deno.test(
  "group code matches only the activation issued for that group",
  () => {
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
    assertStrictEquals(
      matchGroupActivation(`הקוד ${code}`, pendings, "team@g.us")?.id,
      "here",
    );
    assertStrictEquals(
      matchGroupActivation(code, pendings, "missing@g.us"),
      null,
    );
    assertStrictEquals(
      matchGroupActivation("972501111111", pendings, "team@g.us"),
      null,
    );
  },
);

Deno.test("intro names the linked agency and keeps the code private", () => {
  const intro = introMessage({ agencyName: "דור מדיה", clientName: "לקוח א" });
  assertMatch(intro, /מנהלת השיווק הדיגיטלי של דור מדיה/);
  assertMatch(intro, /לקוח א/);
  assertStrictEquals(introMessage({ clientName: "לקוח א" }), "");
  assertNotMatch(intro, /\d{6}/);
  assertMatch(
    privateCodeMessage({ name: "דוד", agencyName: "דור מדיה", code: "123456" }),
    /123456/,
  );
  assertMatch(
    agencyVoiceNote({ agencyName: "דור מדיה", clientName: "לקוח א" }),
    /דור מדיה/,
  );
});

Deno.test(
  "a group is introduced only when it already has a client and an agency",
  () => {
    const groupId = "11111111-1111-1111-1111-111111111111";
    const clientId = "33333333-3333-3333-3333-333333333333";
    const agencyId = "44444444-4444-4444-4444-444444444444";
    const [linked] = attachGroupAffiliations(
      [{ id: groupId, group_chat_id: "team@g.us", group_name: "צוות" }],
      [
        {
          whatsapp_group_id: groupId,
          client_id: clientId,
          agency_id: agencyId,
        },
      ],
      [{ id: clientId, name: "לקוח א", agency_id: agencyId }],
      [{ id: agencyId, name: "דור מדיה" }],
    );
    assertStrictEquals(groupsReadyToIntroduce([linked]).length, 1);
    const [unlinked] = attachGroupAffiliations(
      [{ id: groupId, group_chat_id: "team@g.us" }],
      [],
      [],
      [],
    );
    assertStrictEquals(groupsReadyToIntroduce([unlinked]).length, 0);
  },
);

Deno.test("round uses approved group phones and Manus groups only", () => {
  const phones = selectRoundPhones([
    {
      phone: "972501111111",
      label: "דוד",
      surfaces: ["whatsapp_private", "whatsapp_group"],
    },
    { phone: "972502222222", surfaces: ["whatsapp_private"] },
    { phone: "972503333333", status: "revoked", surfaces: ["whatsapp_group"] },
  ]);
  assertEquals(
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
  assertEquals(
    groups.map((group) => group.id),
    [manusId],
  );
  assertEquals(
    selectRoundGroups(groups, {
      allowedGroupIds: [greenId],
      openMemberGroups: false,
    }),
    [],
  );
  assertStrictEquals(
    selectRoundGroups(groups, {
      allowedGroupIds: [manusId],
      openMemberGroups: false,
    }).length,
    1,
  );
});

Deno.test(
  "relationship note reads the approved identity and skips everyone else",
  () => {
    assertMatch(
      relationshipNoteForIdentity({
        status: "approved",
        display_name: "דוד",
        phone: "972501111111",
        relationship_note: "דבר קצר ולעניין",
      }),
      /דבר קצר/,
    );
    assertStrictEquals(
      relationshipNoteForIdentity({
        status: "pending",
        relationship_note: "לא להציג",
      }),
      "",
    );
  },
);
