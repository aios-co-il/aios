import { assertMatch } from "jsr:@std/assert@1";
import { formatClientFollowUpMessage } from "../_shared/client-follow-up-message.ts";

Deno.test("campaigner reminder includes client name and link", () => {
  const message = formatClientFollowUpMessage(
    "client_follow_up_reminder",
    { id: "client-1", name: "אורן בע״מ", follow_up_date: "2026-08-24" },
    "פליקס",
    ["פליקס"],
  );
  assertMatch(message, /אורן בע״מ/);
  assertMatch(message, /תאריך לשיחה: 2026-08-24/);
  assertMatch(message, /clients\?client=client-1/);
});

Deno.test("manager reminder includes assignee names", () => {
  const message = formatClientFollowUpMessage(
    "client_follow_up_reminder_manager",
    { id: "client-1", name: "אורן בע״מ", follow_up_date: "2026-08-24" },
    "דוד",
    ["פליקס", "מיה"],
  );
  assertMatch(message, /קמפיינר משויך: פליקס, מיה/);
  assertMatch(message, /הגיע הזמן לדבר/);
});
