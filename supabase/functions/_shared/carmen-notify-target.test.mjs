import { assertNotStrictEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isGroupChatId,
  isManagerStaffRole,
  normalizeNotifyPhone,
  pickNotifyDelivery,
  resolveCarmenNotifyTarget,
} from "./carmen-notify-target.ts";

const DAVID = "972507677613";
const FELIX = "972558833168";

Deno.test("normalizeNotifyPhone: Israeli local + JID → 972", () => {
  assertStrictEquals(normalizeNotifyPhone("0507677613"), DAVID);
  assertStrictEquals(normalizeNotifyPhone("0558833168"), FELIX);
  assertStrictEquals(normalizeNotifyPhone(`${DAVID}@c.us`), DAVID);
  assertStrictEquals(normalizeNotifyPhone(DAVID), DAVID);
});

Deno.test("isManagerStaffRole recognizes Hebrew team manager", () => {
  assertStrictEquals(isManagerStaffRole("מנהל צוות"), true);
  assertStrictEquals(isManagerStaffRole("קמפיינר"), false);
  assertStrictEquals(isManagerStaffRole("manager"), true);
});

Deno.test(
  "DMM: first report recipient → Felix, not newest David session",
  () => {
    const result = resolveCarmenNotifyTarget({
      reportRecipients: [
        { phone: FELIX, name: "פליקס", source: "configured" },
        { phone: DAVID, name: "דוד", source: "configured" },
      ],
      sessions: [
        {
          chat_id: `${DAVID}@c.us`,
          phone: DAVID,
          sender_name: "דוד",
          updated_at: "2026-08-05",
        },
        {
          chat_id: `${FELIX}@c.us`,
          phone: FELIX,
          sender_name: "פליקס",
          updated_at: "2026-07-01",
        },
      ],
      staff: [
        { phone: FELIX, full_name: "פליקס", role: "מנהל צוות" },
        { phone: "0501234567", full_name: "Other", role: "קמפיינר" },
      ],
    });
    assertStrictEquals(result.source, "report_recipient");
    assertStrictEquals(normalizeNotifyPhone(result.chatId), FELIX);
    assertStrictEquals(result.phone, FELIX);
  },
);

Deno.test(
  "DMM: with only the owner fallback, prefer Felix manager session over owner David",
  () => {
    const result = resolveCarmenNotifyTarget({
      reportRecipients: [
        { phone: DAVID, name: "דוד", source: "owner_fallback" },
      ],
      sessions: [
        {
          chat_id: `${DAVID}@c.us`,
          phone: DAVID,
          sender_name: "דוד",
          updated_at: "2026-08-05",
        },
        {
          chat_id: `${FELIX}@c.us`,
          phone: FELIX,
          sender_name: "פליקס",
          updated_at: "2026-07-01",
        },
      ],
      staff: [
        { phone: FELIX, full_name: "פליקס", role: "מנהל צוות" },
        { phone: "972549757611", full_name: "אביעד", role: "קמפיינר" },
      ],
    });
    assertStrictEquals(result.source, "tenant_staff_session");
    assertStrictEquals(normalizeNotifyPhone(result.chatId), FELIX);
    assertNotStrictEquals(normalizeNotifyPhone(result.chatId), DAVID);
  },
);

Deno.test(
  "DMM: David-only sessions + Felix staff phone → Felix (no David fallback)",
  () => {
    const result = resolveCarmenNotifyTarget({
      reportRecipients: [],
      sessions: [
        { chat_id: `${DAVID}@c.us`, phone: DAVID, sender_name: "דוד" },
      ],
      staff: [{ phone: FELIX, full_name: "פליקס", role: "מנהל צוות" }],
    });
    assertStrictEquals(result.source, "tenant_staff_phone");
    assertStrictEquals(normalizeNotifyPhone(result.chatId), FELIX);
  },
);

Deno.test("DMM: David sessions + empty staff → refuse", () => {
  const result = resolveCarmenNotifyTarget({
    reportRecipients: [],
    preferredPhone: null,
    sessions: [{ chat_id: `${DAVID}@c.us`, phone: DAVID, sender_name: "דוד" }],
    staff: [],
  });
  assertStrictEquals(result.source, "none");
  assertStrictEquals(result.chatId, "");
});

Deno.test("preferred_phone wins over the report recipients", () => {
  const result = resolveCarmenNotifyTarget({
    preferredPhone: DAVID,
    reportRecipients: [{ phone: FELIX, name: "פליקס", source: "configured" }],
    sessions: [
      { chat_id: `${DAVID}@c.us`, phone: DAVID, sender_name: "דוד" },
      { chat_id: `${FELIX}@c.us`, phone: FELIX, sender_name: "פליקס" },
    ],
    staff: [{ phone: FELIX, full_name: "פליקס", role: "מנהל צוות" }],
  });
  assertStrictEquals(result.source, "preferred_phone");
  assertStrictEquals(normalizeNotifyPhone(result.chatId), DAVID);
});

Deno.test("MC: report recipient David works when he is tenant staff", () => {
  const result = resolveCarmenNotifyTarget({
    reportRecipients: [{ phone: DAVID, name: "דוד", source: "configured" }],
    sessions: [{ chat_id: `${DAVID}@c.us`, phone: DAVID, sender_name: "דוד" }],
    staff: [{ phone: "0507677613", full_name: "דוד", role: "owner" }],
  });
  assertStrictEquals(result.source, "report_recipient");
  assertStrictEquals(normalizeNotifyPhone(result.chatId), DAVID);
});

Deno.test(
  "manager staff preferred over campaigner when both have sessions",
  () => {
    const avi = "972549757611";
    const result = resolveCarmenNotifyTarget({
      sessions: [
        {
          chat_id: `${avi}@c.us`,
          phone: avi,
          sender_name: "אביעד",
          updated_at: "2026-08-05",
        },
        {
          chat_id: `${FELIX}@c.us`,
          phone: FELIX,
          sender_name: "פליקס",
          updated_at: "2026-07-01",
        },
      ],
      staff: [
        { phone: avi, full_name: "אביעד", role: "קמפיינר" },
        { phone: FELIX, full_name: "פליקס", role: "מנהל צוות" },
      ],
    });
    assertStrictEquals(result.source, "tenant_staff_session");
    assertStrictEquals(normalizeNotifyPhone(result.chatId), FELIX);
  },
);

Deno.test("isGroupChatId detects WhatsApp group JIDs", () => {
  assertStrictEquals(isGroupChatId("120363425732219862@g.us"), true);
  assertStrictEquals(isGroupChatId("972507677613@c.us"), false);
  assertStrictEquals(isGroupChatId(DAVID), false);
});

Deno.test(
  "newest group session with David's phone does not steal private notify",
  () => {
    const group = "120363425732219862@g.us";
    const result = resolveCarmenNotifyTarget({
      preferredPhone: DAVID,
      sessions: [
        {
          chat_id: group,
          phone: DAVID,
          sender_name: "דוד",
          updated_at: "2026-08-27T12:23:00Z",
        },
        {
          chat_id: `${DAVID}@c.us`,
          phone: DAVID,
          sender_name: "דוד",
          updated_at: "2026-08-27T11:01:00Z",
        },
      ],
      staff: [{ phone: DAVID, full_name: "דוד", role: "owner" }],
    });
    assertStrictEquals(result.source, "preferred_phone");
    assertStrictEquals(result.chatId, `${DAVID}@c.us`);
    assertStrictEquals(isGroupChatId(result.chatId), false);
  },
);

Deno.test(
  "group-only sessions fall back to private phone digits, not the group JID",
  () => {
    const result = resolveCarmenNotifyTarget({
      reportRecipients: [{ phone: DAVID, name: "דוד", source: "configured" }],
      sessions: [
        {
          chat_id: "120363425732219862@g.us",
          phone: DAVID,
          sender_name: "דוד",
        },
      ],
      staff: [{ phone: DAVID, full_name: "דוד", role: "owner" }],
    });
    assertStrictEquals(result.source, "report_recipient");
    assertStrictEquals(result.phone, DAVID);
    assertStrictEquals(isGroupChatId(result.chatId), false);
    assertStrictEquals(normalizeNotifyPhone(result.chatId), DAVID);
  },
);

Deno.test(
  "pickNotifyDelivery never sends pulse/notify to a group even if that row is newest",
  () => {
    const group = "120363425732219862@g.us";
    const delivery = pickNotifyDelivery(
      [
        {
          chat_id: group,
          phone: DAVID,
          sender_name: "דוד",
          automation_id: "group-auto",
          connection_user_id: "u1",
        },
        {
          chat_id: `${DAVID}@c.us`,
          phone: DAVID,
          sender_name: "דוד",
          automation_id: "private-auto",
          connection_user_id: "u1",
        },
      ],
      { chatId: group, phone: DAVID },
    );
    assertStrictEquals(delivery.isGroup, false);
    assertStrictEquals(delivery.chatId, `${DAVID}@c.us`);
    assertStrictEquals(delivery.phoneNumber, DAVID);
    assertStrictEquals(delivery.matchedSession?.automation_id, "private-auto");
    assertStrictEquals(delivery.bridgeSession?.automation_id, "private-auto");
  },
);

Deno.test(
  "pickNotifyDelivery can use a group row only as automation bridge",
  () => {
    const delivery = pickNotifyDelivery(
      [
        {
          chat_id: "120363425732219862@g.us",
          phone: DAVID,
          automation_id: "group-auto",
          connection_user_id: "u1",
        },
      ],
      { chatId: DAVID, phone: DAVID },
    );
    assertStrictEquals(delivery.isGroup, false);
    assertStrictEquals(delivery.chatId, DAVID);
    assertStrictEquals(delivery.matchedSession, null);
    assertStrictEquals(delivery.bridgeSession?.automation_id, "group-auto");
  },
);
