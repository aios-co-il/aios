import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";
import {
  buildGroupSenderContextNote,
  managerGroupAccessViaAllowedPhones,
  phonesMatch,
  resolveGroupParticipantPhone,
} from "./carmen-group-sender.mjs";

const GROUP = "120363425732219862@g.us";
const GROUP_DIGITS = "120363425732219862";
const DAVID = "972507677613";
const ANA = "972545612156";

Deno.test("resolveGroupParticipantPhone rejects group JID as sender", () => {
  assertStrictEquals(
    resolveGroupParticipantPhone({
      groupChatId: GROUP,
      phoneNumber: GROUP_DIGITS,
      sourcePhoneNumber: null,
      senderWid: null,
      selfWid: null,
      isOutgoing: false,
    }),
    null,
  );
});

Deno.test(
  "resolveGroupParticipantPhone returns participant from sender wid",
  () => {
    assertStrictEquals(
      resolveGroupParticipantPhone({
        groupChatId: GROUP,
        phoneNumber: GROUP_DIGITS,
        sourcePhoneNumber: null,
        senderWid: `${DAVID}@c.us`,
        selfWid: "972549696673@c.us",
        isOutgoing: false,
      }),
      DAVID,
    );
  },
);

Deno.test(
  "resolveGroupParticipantPhone prefers sourcePhoneNumber when wid missing",
  () => {
    assertStrictEquals(
      resolveGroupParticipantPhone({
        groupChatId: GROUP,
        phoneNumber: GROUP_DIGITS,
        sourcePhoneNumber: ANA,
        senderWid: null,
        selfWid: null,
        isOutgoing: false,
      }),
      ANA,
    );
  },
);

Deno.test("buildGroupSenderContextNote includes participant_phone", () => {
  const note = buildGroupSenderContextNote(DAVID, "דוד");
  assertMatch(note, /participant_phone=972507677613/);
  assertMatch(note, /sender_name=דוד/);
  assertMatch(note, /group_id/);
});

Deno.test("managerGroupAccessViaAllowedPhones: David yes, Ana no", () => {
  const allowed = [DAVID, ANA];
  assertStrictEquals(
    managerGroupAccessViaAllowedPhones({
      phoneDigits: DAVID,
      allowedPhones: allowed,
      isManager: true,
    }),
    true,
  );
  assertStrictEquals(
    managerGroupAccessViaAllowedPhones({
      phoneDigits: ANA,
      allowedPhones: allowed,
      isManager: false,
    }),
    false,
  );
  assertStrictEquals(
    managerGroupAccessViaAllowedPhones({
      phoneDigits: ANA,
      allowedPhones: allowed,
      isManager: true,
    }),
    true,
  );
});

Deno.test("phonesMatch uses last-9 policy", () => {
  assertStrictEquals(phonesMatch("0507677613", DAVID), true);
  assertStrictEquals(phonesMatch(DAVID, "972507677613"), true);
});

Deno.test(
  "green-api group insert stores participant phone not group id",
  () => {
    const source = readFileSync(
      new URL("../green-api-webhook/index.ts", import.meta.url),
      "utf8",
    );
    assertMatch(source, /resolveGroupParticipantPhone/);
    assertMatch(source, /sender_phone: participantPhone/);
    assertMatch(source, /sender_phone: statusParticipantPhone/);
  },
);

Deno.test("manus group path persists chat_messages with authorPhone", () => {
  const source = readFileSync(
    new URL("../manus-wa-webhook/index.ts", import.meta.url),
    "utf8",
  );
  assertMatch(source, /\[manus-wa group\] chat_messages saved/);
  assertMatch(source, /sender_phone: authorPhone/);
});

Deno.test("carmen group identity runs on all channels", () => {
  const source = readFileSync(new URL("./carmen.ts", import.meta.url), "utf8");
  assertMatch(source, /if \(isGroup\) \{[\s\S]*resolveCarmenGroupIdentity/);
  assertNotMatch(source, /if \(isGroup && sourceChannel === 'own_instance'\)/);
});
