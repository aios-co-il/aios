import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import {
  buildWaNotifyFromOrigin,
  isGroupChatId,
  normalizeCarmenChatId,
  originChatsMatch,
  replyDestinationIsConsistent,
  requireOriginChatId,
} from "./carmen-session-identity.ts";

const DAVID_PRIVATE = "972507677613@c.us";
const GROUP_A = "120363425732219862@g.us"; // AfterLead - DMM
const GROUP_B = "120363421902818314@g.us"; // דוד & דקל & אנה
const DAVID_PHONE = "972507677613";

Deno.test("normalizeCarmenChatId keeps group and private JIDs", () => {
  assertStrictEquals(normalizeCarmenChatId(GROUP_A), GROUP_A);
  assertStrictEquals(normalizeCarmenChatId(DAVID_PRIVATE), DAVID_PRIVATE);
  assertStrictEquals(normalizeCarmenChatId(DAVID_PHONE), DAVID_PRIVATE);
  assertStrictEquals(normalizeCarmenChatId(""), null);
  assertStrictEquals(normalizeCarmenChatId(null), null);
});

Deno.test("two groups with the same speaker are different sessions", () => {
  assertStrictEquals(originChatsMatch(GROUP_A, GROUP_B), false);
  assertStrictEquals(originChatsMatch(GROUP_A, GROUP_A), true);
  assertStrictEquals(originChatsMatch(GROUP_A, DAVID_PRIVATE), false);
  assertStrictEquals(isGroupChatId(GROUP_A), true);
  assertStrictEquals(isGroupChatId(DAVID_PRIVATE), false);
});

Deno.test("requireOriginChatId refuses phone-only / missing keys", () => {
  assertStrictEquals(requireOriginChatId(GROUP_A).ok, true);
  assertStrictEquals(requireOriginChatId("").ok, false);
  assertStrictEquals(requireOriginChatId(null).ok, false);
  // digits-only is a private chat, not "whatever group this phone was last in"
  const origin = requireOriginChatId(DAVID_PHONE);
  assertStrictEquals(origin.ok, true);
  if (origin.ok) {
    assertStrictEquals(origin.chatId, DAVID_PRIVATE);
    assertStrictEquals(origin.isGroup, false);
  }
});

Deno.test("reply destination must match JID type", () => {
  assertStrictEquals(
    replyDestinationIsConsistent({ chatId: GROUP_A, isGroup: true }),
    true,
  );
  assertStrictEquals(
    replyDestinationIsConsistent({ chatId: GROUP_A, isGroup: false }),
    false,
  );
  assertStrictEquals(
    replyDestinationIsConsistent({ chatId: DAVID_PRIVATE, isGroup: false }),
    true,
  );
  assertStrictEquals(
    replyDestinationIsConsistent({ chatId: DAVID_PRIVATE, isGroup: true }),
    false,
  );
});

Deno.test(
  "wa_notify is pinned to the originating group, not the speaker phone",
  () => {
    const notify = buildWaNotifyFromOrigin({
      tenantId: "t1",
      automationId: "auto-groups",
      connectionUserId: "u1",
      chatId: GROUP_B,
      speakerPhone: DAVID_PHONE,
    });
    assert(notify);
    assertStrictEquals(notify.chat_id, GROUP_B);
    assertStrictEquals(notify.is_group, true);
    assertStrictEquals(notify.phone_number, DAVID_PHONE);
    assertStrictEquals(originChatsMatch(notify.chat_id, GROUP_A), false);
  },
);

Deno.test("a question in group A cannot restore history from group B", () => {
  const askedIn = requireOriginChatId(GROUP_A);
  const otherSession = { chat_id: GROUP_B, phone: DAVID_PHONE };
  assertStrictEquals(askedIn.ok, true);
  assertStrictEquals(
    originChatsMatch(askedIn.ok ? askedIn.chatId : null, otherSession.chat_id),
    false,
  );
});

Deno.test(
  "system automations never take a group JID as the destination",
  () => {
    // Pulse / health / coding-agent notify must stay on the configured private chat.
    assertStrictEquals(isGroupChatId(GROUP_A), true);
    assertStrictEquals(
      replyDestinationIsConsistent({ chatId: GROUP_A, isGroup: false }),
      false,
    );
    assertStrictEquals(
      replyDestinationIsConsistent({ chatId: DAVID_PRIVATE, isGroup: false }),
      true,
    );
  },
);
