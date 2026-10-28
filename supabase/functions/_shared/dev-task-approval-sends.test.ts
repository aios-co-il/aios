import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  devTaskSendRule,
  directDevSendRefusal,
  workshopDevTaskRule,
} from "./dev-task-approval.ts";

const OFFER =
  "פתחתי משימה ל-Cursor לתקן את הכפתור. [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]";

/** David's turn in an AIOS chat outside the workshop (the video studio, the sidecar). */
const turn = (over: Record<string, unknown> = {}) => ({
  appChatUser: true,
  userText: "כן",
  lastAssistantText: OFFER,
  ...over,
});

Deno.test(
  "a direct send to Cursor or Claude waits for the user's yes to Carmen's offer",
  () => {
    for (const tool of [
      "mcp_Cursor__request_dev_task",
      "mcp_Cursor__ask_cursor",
      "mcp_Claude__request_dev_task",
      "mcp_Claude__ask_claude",
      "request_dev_task",
    ]) {
      // Same turn as the request: nothing offered yet.
      const asked = directDevSendRefusal(
        tool,
        turn({ userText: "תשלחי לקרסר לתקן את הכפתור", lastAssistantText: "" }),
      );
      assertStrictEquals(asked?.error, "dev_send_needs_yes", tool);
      assertMatch(String(asked?.message), /\[\[בחירה: .*\| כן \| לא\]\]/);
      assertStrictEquals(
        directDevSendRefusal(tool, turn({ appChatUser: false }))?.error,
        "dev_task_approval_not_app_chat",
        tool,
      );
    }
    assertStrictEquals(
      directDevSendRefusal("mcp_Cursor__request_dev_task", turn()),
      null,
    );
    assertStrictEquals(
      directDevSendRefusal(
        "mcp_Cursor__request_dev_task",
        turn({ userText: "כן תשלחי לקלוד" }),
      )?.error,
      "dev_task_approval_target_mismatch",
    );
    // Reading a session or another connector is no send.
    for (const tool of ["mcp_Cursor__list_cursor_task_sessions", "list_leads"])
      assertStrictEquals(
        directDevSendRefusal(
          tool,
          turn({ userText: "", lastAssistantText: "" }),
        ),
        null,
        tool,
      );
  },
);

Deno.test(
  "outside the workshop each chat is told how a dev task is sent",
  () => {
    const app = devTaskSendRule(true);
    assertMatch(app, /\[\[בחירה: לשלוח את משימת הפיתוח\? \| כן \| לא\]\]/);
    assertMatch(app, /בהודעה הבאה/);
    const whatsapp = devTaskSendRule(false);
    assertMatch(whatsapp, /create_dev_task/);
    assertMatch(whatsapp, /מרכז משימות הפיתוח/);
    assertStrictEquals(
      /approve_dev_task|dispatch_dev_task/.test(whatsapp),
      false,
    );
  },
);

Deno.test("each tier is told only what it may do in the workshop", () => {
  const david = workshopDevTaskRule("full");
  assertMatch(david, /Cursor או ל-Claude/);
  assertMatch(david, /בהודעה הבאה/);
  assertStrictEquals(david.includes("mcp_Cursor__request_dev_task"), false);
  const ana = workshopDevTaskRule("bugfix");
  assertMatch(ana, /assigned_agent=cursor/);
  assertMatch(ana, /רק דיוויד/);
  assertMatch(ana, /בהודעה הבאה/);
  assertStrictEquals(/Cursor או ל-Claude|mcp_/.test(ana), false);
});
