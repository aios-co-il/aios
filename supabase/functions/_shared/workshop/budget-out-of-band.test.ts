import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

/**
 * checkBudget lets a call through without the budget when deps.approvedOutOfBand is set
 * (budget.ts). run-ai-agent sets it from approval.outOfBand, so this guards where that comes from.
 */
Deno.test(
  "only a call approved in the approvals queue skips the budget, never a chat turn",
  () => {
    const agent = readFileSync(
      new URL(
        "../../run-ai-agent/direct-tools/execute-approved.ts",
        import.meta.url,
      ),
      "utf8",
    );
    // One call sets it, in handleDirectTool's execute_approved branch: a queue row of
    // action_type agent_direct_tool that a person approved.
    const marks = [...agent.matchAll(/outOfBand:\s*true/g)];
    assertStrictEquals(marks.length, 1);
    const approved = agent.indexOf("async function executeApprovedDirectTool(");
    assert(approved > 0 && (marks[0].index ?? -1) > approved);
    const request = readFileSync(
      new URL("../../run-ai-agent/request/handle.ts", import.meta.url),
      "utf8",
    );
    // That handler answers service-role callers only; a signed-in chat turn gets a 403.
    assertMatch(
      request,
      /if \(bodyJson\.direct_tool\) \{\s*if \(auth\.kind !== "service"\)/,
    );
    // The chat turn's approval context names the turn and the user's text, never outOfBand.
    const modelTool = readFileSync(
      new URL("../../run-ai-agent/run/execute-model-tool.ts", import.meta.url),
      "utf8",
    );
    const turn = modelTool.indexOf("devTaskTurn: {");
    const context = modelTool.slice(
      modelTool.lastIndexOf("{", turn),
      turn + 800,
    );
    assert(turn > 0 && !context.includes("outOfBand"));
  },
);
