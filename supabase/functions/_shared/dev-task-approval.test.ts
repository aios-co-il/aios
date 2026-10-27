import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  devTaskApprovalDecision,
  devTaskCenterRefusal,
  devTaskUpdatePatch,
  directDevSendRefusal,
  dispatchRefusal,
  isExplicitDevTaskApproval,
  namedDevAgent,
  pickOfferedDevTask,
} from "./dev-task-approval.ts";

const TURN = "2026-10-27T10:00:00.000Z";
const EARLIER = "2026-10-27T09:58:00.000Z";
const LATER = "2026-10-27T10:00:05.000Z";
const draft = { status: "draft", created_at: EARLIER };

Deno.test("plain yes messages approve a dev task", () => {
  for (const text of [
    "כן",
    "כן!",
    "מאשר",
    "מאשרת",
    "כן מאשר",
    "כן, תשלחי",
    "כן תשלחי לקרסר",
    "תשלחי לקלוד",
    "שלחי את זה לפיתוח",
    "יאללה תשלחי",
    "ותפתחי משימה",
    "yes",
    "yes, send it",
    "go ahead",
    "🎤 כן תשלחי",
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

Deno.test("a task from an earlier turn is approved by the user's yes", () => {
  assertEquals(
    devTaskApprovalDecision({
      task: draft,
      userText: "כן",
      turnStartedAt: TURN,
    }),
    { ok: true },
  );
  assertEquals(
    devTaskApprovalDecision({
      task: { status: "approved", created_at: EARLIER },
      userText: "מאשר",
      turnStartedAt: new Date(TURN),
    }),
    { ok: true },
  );
});

Deno.test("a task made in this turn waits for the next message", () => {
  const decision = devTaskApprovalDecision({
    task: { status: "draft", created_at: LATER },
    userText: "תעבירי לפיתוח ותשלחי",
    turnStartedAt: TURN,
  });
  assertStrictEquals(decision.ok, false);
  if (!decision.ok) assertStrictEquals(decision.reason, "same_turn");
  const missing = devTaskApprovalDecision({
    task: { status: "draft", created_at: null },
    userText: "כן",
    turnStartedAt: TURN,
  });
  if (!missing.ok) assertStrictEquals(missing.reason, "same_turn");
  else throw new Error("a task without created_at was approved");
});

Deno.test("a message that is not a yes is refused with what to ask", () => {
  const decision = devTaskApprovalDecision({
    task: draft,
    userText: "יש לך גישה לתמונות של הסקינים שלך?",
    turnStartedAt: TURN,
  });
  assertStrictEquals(decision.ok, false);
  if (!decision.ok) {
    assertStrictEquals(decision.reason, "not_explicit");
    assertStrictEquals(decision.message.includes("כן"), true);
  }
});

Deno.test("no user message (automations, direct calls) cannot approve", () => {
  for (const input of [
    { task: draft, userText: "", turnStartedAt: TURN },
    { task: draft, userText: "כן", turnStartedAt: null },
    { task: draft },
  ]) {
    const decision = devTaskApprovalDecision(input);
    assertStrictEquals(decision.ok, false);
    if (!decision.ok) assertStrictEquals(decision.reason, "no_turn");
  }
});

Deno.test("an approval from the approvals queue needs no chat message", () => {
  assertEquals(devTaskApprovalDecision({ task: draft, outOfBand: true }), {
    ok: true,
  });
});

Deno.test("a missing task or one that already left is refused", () => {
  const none = devTaskApprovalDecision({
    task: null,
    userText: "כן",
    turnStartedAt: TURN,
  });
  if (!none.ok) assertStrictEquals(none.reason, "not_found");
  else throw new Error("approved a missing task");
  for (const status of ["sent_to_cursor", "in_progress", "done", "cancelled"]) {
    const decision = devTaskApprovalDecision({
      task: { status, created_at: EARLIER },
      userText: "כן",
      turnStartedAt: TURN,
      outOfBand: true,
    });
    if (!decision.ok) assertStrictEquals(decision.reason, "not_draft");
    else throw new Error(`approved a ${status} task`);
  }
});

Deno.test("only an approved task with an approver may be dispatched", () => {
  assertStrictEquals(
    dispatchRefusal({ status: "approved", approved_by: "u-1" }),
    null,
  );
  for (const task of [
    null,
    { status: "draft", approved_by: null },
    { status: "draft", approved_by: "u-1" },
    { status: "approved", approved_by: null },
    { status: "approved" },
  ])
    assertStrictEquals(
      dispatchRefusal(task)?.error,
      "dev_task_not_approved",
      JSON.stringify(task),
    );
});

// What run-ai-agent gets from WhatsApp in command_text: the "כן" plus the webhook's notes.
const WA_SUFFIX =
  "\n\n[בידוד שיחה] chat_id=972501234567@c.us. עני רק בהקשר של השיחה הזו (סשן נוכחי). אל תגררי נושאים משיחות פרטיות/קבוצות אחרות או מימים קודמים אלא אם המשתמש ביקש במפורש לזכור.";

Deno.test(
  "on WhatsApp the raw message approves, not the text with notes",
  () => {
    const withNotes = devTaskApprovalDecision({
      task: draft,
      userText: `כן${WA_SUFFIX}`,
      turnStartedAt: TURN,
    });
    if (!withNotes.ok) assertStrictEquals(withNotes.reason, "not_explicit");
    else throw new Error("the notes should not read as a plain yes");
    assertEquals(
      devTaskApprovalDecision({
        task: draft,
        userText: "כן",
        turnStartedAt: TURN,
      }),
      { ok: true },
    );
  },
);

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

Deno.test("a yes that names the other agent does not approve", () => {
  assertStrictEquals(namedDevAgent("כן תשלחי לקלוד"), "claude");
  assertStrictEquals(namedDevAgent("כן, ל-Cursor"), "cursor");
  assertStrictEquals(namedDevAgent("כן"), null);
  const decision = devTaskApprovalDecision({
    task: { ...draft, assigned_agent: "cursor" },
    userText: "כן תשלחי לקלוד",
    turnStartedAt: TURN,
  });
  if (!decision.ok) assertStrictEquals(decision.reason, "target_mismatch");
  else throw new Error("approved a Cursor task for Claude");
  assertEquals(
    devTaskApprovalDecision({
      task: { ...draft, assigned_agent: "claude" },
      userText: "כן תשלחי לקלוד",
      turnStartedAt: TURN,
    }),
    { ok: true },
  );
});

Deno.test("a bug-fix caller approves only her own Cursor tasks", () => {
  const ana = { id: "ana", tier: "bugfix" as const };
  const claude = devTaskApprovalDecision({
    task: { ...draft, assigned_agent: "claude", requested_by_user_id: "ana" },
    userText: "כן",
    turnStartedAt: TURN,
    approver: ana,
  });
  if (!claude.ok) assertStrictEquals(claude.reason, "bugfix_cursor_only");
  else throw new Error("Ana approved a Claude task");
  const davids = devTaskApprovalDecision({
    task: { ...draft, assigned_agent: "cursor", requested_by_user_id: "david" },
    userText: "כן",
    turnStartedAt: TURN,
    approver: ana,
  });
  if (!davids.ok) assertStrictEquals(davids.reason, "not_requester");
  else throw new Error("Ana approved David's task");
  assertEquals(
    devTaskApprovalDecision({
      task: { ...draft, assigned_agent: "cursor", requested_by_user_id: "ana" },
      userText: "כן",
      turnStartedAt: TURN,
      approver: ana,
    }),
    { ok: true },
  );
});

Deno.test("an update never approves, and an edit asks for a new yes", () => {
  const keys = ["status", "problem", "title", "pr_url", "priority"];
  const approve = devTaskUpdatePatch(
    { status: "draft" },
    { status: "approved" },
    keys,
  );
  assertStrictEquals(approve.ok, false);
  const edit = devTaskUpdatePatch(
    { status: "approved" },
    { problem: "הוראות חדשות" },
    keys,
    "NOW",
  );
  assertEquals(edit, {
    ok: true,
    patch: {
      updated_at: "NOW",
      problem: "הוראות חדשות",
      status: "draft",
      approved_by: null,
      approved_at: null,
    },
  });
  // Once sent, a PR link or a status is bookkeeping; the approval stays.
  assertEquals(
    devTaskUpdatePatch(
      { status: "in_progress" },
      { pr_url: "u", status: "pr_opened" },
      keys,
      "NOW",
    ),
    {
      ok: true,
      patch: { updated_at: "NOW", pr_url: "u", status: "pr_opened" },
    },
  );
});

Deno.test(
  "sending straight to Cursor or Claude needs the user's yes now",
  () => {
    for (const tool of [
      "mcp_Cursor__request_dev_task",
      "mcp_Claude__request_dev_task",
      "assign_task_to_cursor",
    ]) {
      assertStrictEquals(
        directDevSendRefusal(tool, "תשלחי לקלוד תיקון לבאג בדוח")?.error,
        "dev_send_needs_approval",
        tool,
      );
      assertStrictEquals(directDevSendRefusal(tool, "כן, לשלוח"), null, tool);
    }
    assertStrictEquals(
      directDevSendRefusal("mcp_Manus__request_dev_task", "x"),
      null,
    );
    assertStrictEquals(directDevSendRefusal("list_clients", "x"), null);
  },
);

Deno.test("a yes goes to the dev task offered in this conversation", () => {
  const rows = [
    {
      id: "old",
      status: "draft",
      created_at: "2026-10-27T08:00:00.000Z",
      source_conversation_id: "c1",
    },
    {
      id: "other",
      status: "draft",
      created_at: EARLIER,
      source_conversation_id: "c2",
    },
    {
      id: "now",
      status: "draft",
      created_at: LATER,
      source_conversation_id: "c1",
    },
    {
      id: "offered",
      status: "draft",
      created_at: EARLIER,
      source_conversation_id: "c1",
    },
  ];
  assertStrictEquals(
    pickOfferedDevTask(rows, { conversationId: "c1", turnStartedAt: TURN })?.id,
    "offered",
  );
  assertStrictEquals(
    pickOfferedDevTask(rows, { conversationId: "c3", turnStartedAt: TURN }),
    null,
  );
  // No conversation (WhatsApp): the caller's own recent draft.
  assertStrictEquals(
    pickOfferedDevTask(
      [
        {
          id: "mine",
          status: "draft",
          created_at: EARLIER,
          requested_by_user_id: "u1",
        },
      ],
      { userId: "u1", turnStartedAt: TURN },
    )?.id,
    "mine",
  );
  assertStrictEquals(pickOfferedDevTask([], { turnStartedAt: TURN }), null);
});

Deno.test("the Dev Task Center checks the tenant and the dev tier", () => {
  const base = { service: false, member: true, tier: "full" as const };
  assertStrictEquals(
    devTaskCenterRefusal({ ...base, action: "dispatch" }),
    null,
  );
  assertStrictEquals(
    devTaskCenterRefusal({ ...base, member: false, action: "list" })?.status,
    403,
  );
  assertStrictEquals(
    devTaskCenterRefusal({ ...base, tier: null, action: "list" }),
    null,
  );
  for (const action of ["update", "approve", "dispatch", "create"])
    assertStrictEquals(
      devTaskCenterRefusal({ ...base, tier: null, action })?.status,
      403,
      action,
    );
  assertStrictEquals(
    devTaskCenterRefusal({
      ...base,
      tier: "bugfix",
      action: "dispatch",
      agent: "claude",
    })?.status,
    403,
  );
  assertStrictEquals(
    devTaskCenterRefusal({
      ...base,
      tier: "bugfix",
      action: "dispatch",
      agent: "cursor",
    }),
    null,
  );
  assertStrictEquals(
    devTaskCenterRefusal({
      service: true,
      member: false,
      tier: null,
      action: "dispatch",
    }),
    null,
  );
});
