import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  DEV_TASK_OFFER_TTL_MS,
  isExplicitDevTaskApproval,
  namedDevAgent,
  type WorkshopDevTaskInput,
  workshopDevTaskDecision,
  workshopDevTaskRule,
} from "./dev-task-approval.ts";

const TURN = "2026-10-27T10:00:00.000Z";
const EARLIER = "2026-10-27T09:58:00.000Z";
const LATER = "2026-10-27T10:00:05.000Z";
const CHAT = "conv-1";
const OFFER =
  "פתחתי משימה ל-Cursor לתקן את הכפתור. [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]";
const offered = {
  id: "task-1",
  status: "draft",
  created_at: EARLIER,
  assigned_agent: "cursor",
  source_conversation_id: CHAT,
};
/** David's "כן" in the workshop chat, the turn after Carmen offered the task. */
const yes = (
  over: Partial<WorkshopDevTaskInput> = {},
): WorkshopDevTaskInput => ({
  task: offered,
  appChatUser: true,
  userText: "כן",
  turnStartedAt: TURN,
  conversationId: CHAT,
  lastAssistantText: OFFER,
  offeredTaskId: "task-1",
  ...over,
});
const reason = (input: WorkshopDevTaskInput) => {
  const decision = workshopDevTaskDecision(input);
  return decision.ok ? "ok" : decision.reason;
};

Deno.test("plain yes messages approve a dev task", () => {
  for (const text of [
    "כן",
    "כן!",
    "מאשר",
    "מאשרת",
    "כן מאשר",
    "כן, תשלחי",
    "כן תשלחי",
    "כן תשלחי לקרסר",
    "תשלחי לקלוד",
    "שלחי את זה לפיתוח",
    "יאללה",
    "יאללה תשלחי",
    "ותפתחי משימה",
    "yes",
    "yes, send it",
    "go ahead",
    "🎤 כן תשלחי",
  ])
    assertStrictEquals(isExplicitDevTaskApproval(text), true, text);
});

Deno.test("button labels and everyday yes replies approve", () => {
  for (const text of [
    "כן, לשלוח",
    "כן, לשלוח ל-Cursor",
    "כן לשלוח",
    "כן, תפתחי משימת פיתוח",
    "אוקיי תשלחי",
    "מעולה, תשלחי",
    "מאשר שליחה",
    "כן, ל-Claude Code",
    "כן, ל־Cursor",
    "סבבה",
  ])
    assertStrictEquals(isExplicitDevTaskApproval(text), true, text);
});

Deno.test("a no, a hold or a new request is not an approval", () => {
  for (const text of [
    "",
    "לא",
    "לא עכשיו",
    "אל תשלחי",
    "עוד לא",
    "רגע, חכי",
    "כן אבל לא לקרסר",
    "יש לך גישה לתמונות של הסקינים שלך?",
    "כן, וגם תבדקי את הקמפיין של הלקוח",
    "תשלחי וואטסאפ ללקוח",
    "מה המשימה?",
    "no",
    "don't send it",
  ])
    assertStrictEquals(isExplicitDevTaskApproval(text), false, text);
});

Deno.test(
  "the user's yes in the next message approves the offered task",
  () => {
    for (const userText of ["כן", "כן תשלחי", "מאשר", "יאללה", "כן, לשלוח"])
      assertEquals(workshopDevTaskDecision(yes({ userText })), { ok: true });
    assertEquals(
      workshopDevTaskDecision(
        yes({
          task: { ...offered, status: "approved" },
          turnStartedAt: new Date(TURN),
        }),
      ),
      { ok: true },
    );
  },
);

Deno.test("a task offered in this message waits for the next one", () => {
  const decision = workshopDevTaskDecision(
    yes({ task: { ...offered, created_at: LATER }, userText: "תשלחי לקרסר" }),
  );
  assertStrictEquals(decision.ok, false);
  if (!decision.ok) {
    assertStrictEquals(decision.reason, "same_turn");
    assertMatch(decision.message, /\[\[בחירה: .*\| כן \| לא\]\]/);
  }
  assertStrictEquals(
    reason(yes({ task: { ...offered, created_at: TURN } })),
    "same_turn",
  );
});

Deno.test(
  "only a signed-in user's own message in the app chat approves",
  () => {
    // A service call (WhatsApp webhook, a subagent run, an automation) or no conversation.
    assertStrictEquals(reason(yes({ appChatUser: false })), "no_turn");
    assertStrictEquals(reason(yes({ conversationId: null })), "no_turn");
    assertStrictEquals(reason(yes({ userText: "  " })), "no_turn");
    assertStrictEquals(reason(yes({ turnStartedAt: null })), "no_turn");
  },
);

Deno.test("only a task offered in this conversation, not long ago", () => {
  assertStrictEquals(
    reason(yes({ task: { ...offered, source_conversation_id: "conv-2" } })),
    "other_conversation",
  );
  assertStrictEquals(
    reason(yes({ task: { ...offered, source_conversation_id: null } })),
    "other_conversation",
  );
  const old = new Date(Date.parse(TURN) - DEV_TASK_OFFER_TTL_MS - 1000);
  assertStrictEquals(
    reason(yes({ task: { ...offered, created_at: old.toISOString() } })),
    "expired",
  );
});

Deno.test("a message that is not a yes is refused with what to ask", () => {
  const decision = workshopDevTaskDecision(
    yes({ userText: "יש לך גישה לתמונות של הסקינים שלך?" }),
  );
  assertStrictEquals(decision.ok, false);
  if (!decision.ok) {
    assertStrictEquals(decision.reason, "not_explicit");
    assertMatch(decision.message, /שאלי אם לשלוח/);
  }
  assertStrictEquals(reason(yes({ userText: "לא, חכי" })), "not_explicit");
});

Deno.test("a missing task or one that already left is refused", () => {
  assertStrictEquals(reason(yes({ task: null })), "not_found");
  for (const status of ["in_progress", "done", "cancelled"])
    assertStrictEquals(
      reason(yes({ task: { ...offered, status } })),
      "not_draft",
      status,
    );
});

Deno.test("a yes that names the other agent does not approve", () => {
  assertStrictEquals(namedDevAgent("כן תשלחי לקלוד"), "claude");
  assertStrictEquals(namedDevAgent("כן, ל-Cursor"), "cursor");
  assertStrictEquals(namedDevAgent("כן"), null);
  assertStrictEquals(
    reason(yes({ userText: "כן תשלחי לקלוד" })),
    "target_mismatch",
  );
  assertStrictEquals(
    reason(
      yes({
        task: { ...offered, assigned_agent: "claude" },
        userText: "כן תשלחי לקלוד",
      }),
    ),
    "ok",
  );
});

Deno.test("a bug-fix caller approves only her own Cursor tasks", () => {
  const ana = { id: "ana", tier: "bugfix" as const };
  assertStrictEquals(
    reason(
      yes({
        task: {
          ...offered,
          assigned_agent: "claude",
          requested_by_user_id: "ana",
        },
        approver: ana,
      }),
    ),
    "bugfix_cursor_only",
  );
  assertStrictEquals(
    reason(
      yes({
        task: { ...offered, requested_by_user_id: "david" },
        approver: ana,
      }),
    ),
    "not_requester",
  );
  assertStrictEquals(
    reason(
      yes({ task: { ...offered, requested_by_user_id: "ana" }, approver: ana }),
    ),
    "ok",
  );
});

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

Deno.test("a yes approves only the task Carmen's last message offered", () => {
  // Turn 1 offered the task, turn 2 was a no, turn 3 the designer asked to go on: the yes in
  // turn 4 answers the designer. A plain question has no choice to tap; an older draft is not
  // the one offered last.
  for (const over of [
    { lastAssistantText: "[[בחירה: להמשיך? | כן | לא]]" },
    { lastAssistantText: "לשלוח את משימת הפיתוח?" },
    { lastAssistantText: null },
    { offeredTaskId: "task-2" },
    { offeredTaskId: null },
    { task: { ...offered, id: null } },
  ])
    assertStrictEquals(reason(yes(over)), "not_offered", JSON.stringify(over));
  const decision = workshopDevTaskDecision(yes({ lastAssistantText: "" }));
  if (!decision.ok)
    assertMatch(decision.message, /\[\[בחירה: לשלוח את משימת הפיתוח\?/);
  assertStrictEquals(decision.ok, false);
});
