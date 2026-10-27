import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  devTaskApprovalDecision,
  dispatchRefusal,
  isExplicitDevTaskApproval,
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
