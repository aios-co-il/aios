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
      new URL("../../run-ai-agent/index.ts", import.meta.url),
      "utf8",
    );
    // One call sets it, in handleDirectTool's execute_approved branch: a queue row of
    // action_type agent_direct_tool that a person approved.
    const marks = [...agent.matchAll(/outOfBand:\s*true/g)];
    assertStrictEquals(marks.length, 1);
    const direct = agent.indexOf("async function handleDirectTool(");
    const approved = agent.indexOf('req.action === "execute_approved"', direct);
    assert(direct > 0 && approved > direct && marks[0].index! > approved);
    // That handler answers service-role callers only; a signed-in chat turn gets a 403.
    assertMatch(
      agent,
      /if \(bodyJson\.direct_tool\) \{\s*if \(auth\.kind !== "service"\)/,
    );
    // The chat turn's approval context names the turn and the user's text, never outOfBand.
    const turn = agent.indexOf("devTaskTurn: {");
    const context = agent.slice(agent.lastIndexOf("{", turn), turn + 800);
    assert(turn > 0 && !context.includes("outOfBand"));
  },
);
