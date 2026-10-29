import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { buildFlowStepRows, flowStepSpecs } from "./flow-steps.ts";

function sequentialIds() {
  let n = 0;
  return () => `id-${n++}`;
}

Deno.test("flowStepSpecs reads non-object steps as empty steps", () => {
  assertEquals(flowStepSpecs([{ type: "agent" }, null]), [
    { type: "agent" },
    {},
  ]);
  assertEquals(flowStepSpecs(["text", 3, [{ type: "agent" }]]), [{}, {}, {}]);
});

Deno.test(
  "flowStepSpecs keeps the first 20 object steps and ignores the rest",
  () => {
    const steps = Array.from({ length: 21 }, (_, i) => ({ label: `s${i}` }));
    assertStrictEquals(flowStepSpecs(steps)?.length, 20);
    assertStrictEquals(flowStepSpecs([...steps.slice(0, 20), null]).length, 20);
  },
);

Deno.test("buildFlowStepRows chains a trigger, agent and action step", () => {
  const rows = buildFlowStepRows({
    automationId: "auto-1",
    tenantId: "tenant-1",
    triggerType: "lead_created",
    triggerConfig: { form: "x" },
    agentId: "agent-1",
    steps: [
      { instruction: "hi", skin: "sales", config: { tone: "warm" } },
      { type: "action", label: "notify" },
      { type: "action", action_type: "send_whatsapp", label: 0 },
    ],
    newId: sequentialIds(),
  });
  assertEquals(
    rows.map((r) => [r.id, r.parent_step_id, r.sort_order, r.position_y]),
    [
      ["id-0", null, 0, 60],
      ["id-1", "id-0", 1, 190],
      ["id-2", "id-1", 2, 320],
      ["id-3", "id-2", 3, 450],
    ],
  );
  assertEquals(rows[0], {
    id: "id-0",
    automation_id: "auto-1",
    tenant_id: "tenant-1",
    step_type: "trigger",
    action_type: "lead_created",
    configuration: { form: "x" },
    position_x: 400,
    position_y: 60,
    sort_order: 0,
    parent_step_id: null,
    condition_branch: null,
    label: "טריגר",
  });
  assertStrictEquals(rows[1].step_type, "agent");
  assertStrictEquals(rows[1].action_type, "agent");
  assertStrictEquals(rows[1].label, "agent");
  assertEquals(rows[1].configuration, {
    agent_id: "agent-1",
    skin_slugs: ["sales"],
    step_instruction: "hi",
    tone: "warm",
  });
  assertStrictEquals(rows[2].action_type, "notification");
  assertStrictEquals(rows[2].label, "notify");
  assertEquals(rows[2].configuration, {});
  assertStrictEquals(rows[3].action_type, "send_whatsapp");
  assertStrictEquals(rows[3].label, "action");
});

Deno.test("buildFlowStepRows keeps array configs and drops scalar ones", () => {
  const rows = buildFlowStepRows({
    automationId: "a",
    tenantId: "t",
    triggerType: "manual_command",
    triggerConfig: {},
    agentId: null,
    steps: [
      { type: "action", config: ["x", "y"] },
      { type: "action", config: "text" },
      { type: "action", label: { a: 1 } },
    ],
    newId: sequentialIds(),
  });
  assertEquals(rows[1].configuration, { 0: "x", 1: "y" });
  assertEquals(rows[2].configuration, {});
  assertStrictEquals(rows[3].label, '{"a":1}');
});

Deno.test("buildFlowStepRows lets step config override agent defaults", () => {
  const [, step] = buildFlowStepRows({
    automationId: "a",
    tenantId: "t",
    triggerType: "manual_command",
    triggerConfig: {},
    agentId: null,
    steps: [{ config: { agent_id: "custom", step_instruction: "own" } }],
    newId: sequentialIds(),
  });
  assertEquals(step.configuration, {
    agent_id: "custom",
    skin_slugs: [],
    step_instruction: "own",
  });
});
