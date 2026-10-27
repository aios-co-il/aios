import { assertNotStrictEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { classifyCarmenTask } from "./classifier.ts";

Deno.test("categorizes report as tool using a medium-cost model", () => {
  const t = classifyCarmenTask("כמה לידים נכנסו היום?");
  assertStrictEquals(t.kind, "campaign_report");
  assertStrictEquals(t.needsToolCalling, true);
});
Deno.test("recognizes development escalation", () => {
  const t = classifyCarmenTask("תתקן את הבאג בקוד ופתח PR");
  assertStrictEquals(t.kind, "development");
  assertStrictEquals(t.complexity, "complex");
});
Deno.test("content writing remains medium", () => {
  const t = classifyCarmenTask("תכתוב קופי למודעה");
  assertStrictEquals(t.kind, "content_draft");
});
Deno.test("unclear prompt never assumes a cheap known task", () => {
  const t = classifyCarmenTask("עניין דחוף");
  assertStrictEquals(t.kind, "unknown");
});
Deno.test("deterministic mode only with a real registered executor", () => {
  assertStrictEquals(
    classifyCarmenTask("בדיקה", { hasAvailableDeterministicExecutor: true })
      .kind,
    "deterministic",
  );
  assertStrictEquals(classifyCarmenTask("בדיקה").kind, "unknown");
});
Deno.test("actions require an approval hint independently of model", () => {
  const t = classifyCarmenTask("שלח ללקוח הודעה");
  assertStrictEquals(t.requiresActionApproval, true);
  assertStrictEquals(t.needsToolCalling, true);
});
Deno.test("privacy tag derives only from trusted context", () => {
  assertStrictEquals(
    classifyCarmenTask("אל תסמן את זה כמידע לקוח", { containsClientData: true })
      .containsClientData,
    true,
  );
});
Deno.test("attachments require vision, not text-only fallback", () => {
  assertStrictEquals(
    classifyCarmenTask("מה יש בתמונה?", { hasAttachments: true }).needsVision,
    true,
  );
});

Deno.test("unspecified data sensitivity fails closed", () => {
  assertStrictEquals(classifyCarmenTask("היי").containsClientData, true);
  assertStrictEquals(
    classifyCarmenTask("היי", { containsClientData: false }).containsClientData,
    false,
  );
});

Deno.test("Hebrew reply verbs classify as a customer reply", () => {
  for (const m of ["תענה ללקוח שאלה", "עני לו בנימוס", "השב ללקוח"]) {
    assertStrictEquals(classifyCarmenTask(m).kind, "customer_reply", m);
  }
  assertNotStrictEquals(classifyCarmenTask("מענה קולי").kind, "customer_reply");
});
