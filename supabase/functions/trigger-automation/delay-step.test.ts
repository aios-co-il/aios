import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  delayMs,
  delayStatusGuard,
  MAX_INLINE_DELAY_MS,
  resumeDelayStepId,
  stepsAfter,
} from "./delay-step.ts";

Deno.test("delayMs", async (t) => {
  await t.step("reads the amount the flow editor saves", () => {
    assertStrictEquals(
      delayMs({ delay_value: 7, delay_unit: "days" }),
      7 * 86_400_000,
    );
  });

  await t.step("still reads the older delay_amount key", () => {
    assertStrictEquals(
      delayMs({ delay_amount: "2", delay_unit: "hours" }),
      2 * 3_600_000,
    );
  });

  await t.step("supports weeks", () => {
    assertStrictEquals(
      delayMs({ delay_value: 3, delay_unit: "weeks" }),
      21 * 86_400_000,
    );
  });

  await t.step("defaults to one minute", () => {
    assertStrictEquals(delayMs({}), 60_000);
    assertStrictEquals(delayMs({ delay_value: 0, delay_unit: "nope" }), 60_000);
  });

  await t.step("a week is far beyond what a run waits out itself", () => {
    assertStrictEquals(
      delayMs({ delay_value: 1, delay_unit: "weeks" }) > MAX_INLINE_DELAY_MS,
      true,
    );
  });
});

Deno.test("stepsAfter", async (t) => {
  const outEdges = {
    trigger: [{ targetId: "delay" }, { targetId: "side" }],
    delay: [{ targetId: "update" }],
    update: [{ targetId: "send" }, { targetId: "merge" }],
    side: [{ targetId: "merge" }],
    send: [],
    merge: [],
  };

  await t.step("collects every step downstream of the delay", () => {
    assertEquals([...stepsAfter(outEdges, "delay")].sort(), [
      "merge",
      "send",
      "update",
    ]);
  });

  await t.step("leaves out the delay itself and other branches", () => {
    const after = stepsAfter(outEdges, "delay");
    assertStrictEquals(after.has("delay"), false);
    assertStrictEquals(after.has("side"), false);
    assertStrictEquals(after.has("trigger"), false);
  });

  await t.step("is empty for a step that is not in the flow", () => {
    assertStrictEquals(stepsAfter(outEdges, "gone").size, 0);
  });
});

Deno.test("resumeDelayStepId", async (t) => {
  const body = { _resume_delay_step_id: "step-1" };

  await t.step("resumes for the service role", () => {
    assertStrictEquals(resumeDelayStepId(body, { kind: "service" }), "step-1");
  });

  await t.step("ignores the field from a signed-in user", () => {
    assertStrictEquals(
      resumeDelayStepId(body, { kind: "user", userId: "user-1" }),
      null,
    );
    assertStrictEquals(resumeDelayStepId(body, null), null);
  });

  await t.step("is null for an ordinary run", () => {
    assertStrictEquals(resumeDelayStepId({}, { kind: "service" }), null);
  });
});

Deno.test("delayStatusGuard", async (t) => {
  const payload = {
    lead_id: "lead-1",
    new_status: "follow_up_week",
    status_kind: "response_status",
  };

  await t.step("guards the trigger status when the step asks for it", () => {
    assertEquals(
      delayStatusGuard({ delay_require_same_status: true }, payload),
      {
        lead_id: "lead-1",
        column: "response_status",
        value: "follow_up_week",
      },
    );
  });

  await t.step("is null when the step does not ask for it", () => {
    assertStrictEquals(delayStatusGuard({}, payload), null);
  });
});
