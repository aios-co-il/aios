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
  "every tool that starts a coding agent waits for the user's yes",
  () => {
    for (const [tool, args] of [
      ["mcp_Grok__request_dev_task", {}],
      ["mcp_Grok__ask_grok", {}],
      ["mcp_Manus__request_dev_task", {}],
      ["mcp_Manus__ask_manus", {}],
      // A second connection to the same server gets its own prefix.
      ["mcp_Cursor_Staging__request_dev_task", {}],
      ["delegate_to_github_agent", { action: "analyze_error" }],
      // The CRM task queue: Cursor starts on the task at once.
      ["assign_task_to_cursor", {}],
      ["take_task", { agent_name: "Cursor" }],
    ] as const) {
      const asked = directDevSendRefusal(
        tool,
        turn({ userText: "תשלחי לגרוק לתקן את X", lastAssistantText: "" }),
        args,
      );
      assertStrictEquals(asked?.error, "dev_send_needs_yes", tool);
      assertStrictEquals(
        directDevSendRefusal(tool, turn({ appChatUser: false }), args)?.error,
        "dev_task_approval_not_app_chat",
        tool,
      );
    }
    // Carmen taking a task herself starts no coding agent.
    for (const args of [{}, { agent_name: "carmen" }])
      assertStrictEquals(
        directDevSendRefusal("take_task", turn({ appChatUser: false }), args),
        null,
      );
  },
);

Deno.test("a yes that names the agent sends to that agent only", () => {
  for (const [tool, userText] of [
    ["mcp_Grok__request_dev_task", "כן, תשלחי לגרוק"],
    ["mcp_Grok__ask_grok", "כן"],
    ["mcp_Manus__request_dev_task", "כן למנוס"],
    ["delegate_to_github_agent", "כן, לגיטהאב"],
    ["assign_task_to_cursor", "כן תעבירי לקרסר"],
  ])
    assertStrictEquals(
      directDevSendRefusal(tool, turn({ userText })),
      null,
      `${tool}: ${userText}`,
    );
  // Grok runs on Cursor's agents, but a yes to Cursor is not a yes to Grok.
  for (const [tool, userText] of [
    ["mcp_Grok__request_dev_task", "כן תשלחי לקרסר"],
    ["mcp_Cursor__request_dev_task", "כן, לגרוק"],
    ["mcp_Claude__ask_claude", "כן למנוס"],
  ])
    assertStrictEquals(
      directDevSendRefusal(tool, turn({ userText }))?.error,
      "dev_task_approval_target_mismatch",
      `${tool}: ${userText}`,
    );
});

Deno.test("work already under way goes on without a new yes", () => {
  // Carmen answers inside a Cursor chat or a Grok session the user already sent, or a
  // queued task moves on: no new coding agent starts.
  for (const tool of [
    "mcp_Cursor__reply_to_cursor_session",
    "mcp_Cursor__get_cursor_direct_session",
    "mcp_Cursor__complete_human_task",
    "mcp_Grok__reply_to_aios_session",
  ])
    assertStrictEquals(
      directDevSendRefusal(
        tool,
        turn({ appChatUser: false, userText: "", lastAssistantText: "" }),
      ),
      null,
      tool,
    );
});

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
    // Every coding agent, not only Cursor and Claude.
    for (const rule of [app, whatsapp])
      assertMatch(rule, /mcp_Grok__.*delegate_to_github_agent/);
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
