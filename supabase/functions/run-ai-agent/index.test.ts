import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";

const read = (path: string) =>
  Deno.readTextFileSync(new URL(path, import.meta.url));
const runAiAgent = read("./index.ts");

Deno.test("run-ai-agent index.ts", async (t) => {
  await t.step(
    "run-ai-agent appends the pulse block after the V1/V2 branch and wires the refresh tool",
    () => {
      const v1Start = runAiAgent.indexOf("// ─── V1 PROMPT BUILDING");
      const append = runAiAgent.indexOf(
        "systemPrompt = appendCarmenPulseRules(systemPrompt, {",
      );
      const filterTools = runAiAgent.indexOf("// 4. Filter tools");
      assert(runAiAgent.indexOf("if (shouldUseV2Prompt(agent)) {") < v1Start);
      assert(append > v1Start && append < filterTools);
      // Both branches flow into the append: it is not nested in either of them.
      assert(
        runAiAgent
          .slice(v1Start, append)
          .includes("// ─── Command Center (internal_chat) rendering layer"),
      );
      assertStrictEquals(
        runAiAgent.split("appendCarmenPulseRules(").length - 1,
        1,
        "appended exactly once",
      );
      assert(!runAiAgent.includes("📱 === בדיקת דופק בוואטסאפ (חובה) ==="));
      assertMatch(
        runAiAgent,
        /pulse_rules=\$\{isCarmen \? CARMEN_PULSE_RULES_VERSION : "none"\}/,
      );
      // Routing gets the resolved caller; round 0 and the shortcut use it.
      assertMatch(
        runAiAgent,
        /decidePulseRefreshRouting\(\{[^}]*caller: \{[^}]*role: callerRole,/,
      );
      assertMatch(
        runAiAgent,
        /pulseRefreshToolChoice\(\s*pulseRefreshRoute,\s*cappedTools,?\s*\)/,
      );
      assertMatch(
        runAiAgent,
        /toolName === "refresh_campaign_pulse" &&\s*pulseRefreshRoute\.digestShortcut\s*\) \{\s*pulseDigestShortcut = buildPulseRefreshDigestReply\(result\);/,
      );
      assert(!runAiAgent.includes("isPulseRefreshRequest("));
      // The tool runs with executeTool's caller and scope.
      assertMatch(
        runAiAgent,
        /case "refresh_campaign_pulse": \{\s*return await executeRefreshCampaignPulse\(\s*\{[^}]*actorUserId,\s*accessibleTenantIds,\s*assertCallerCanAccessClient: \(clientId: string\) =>\s*assertCallerCanAccessClient\(supabase, clientId, callerScope\),/,
      );
      const priority = runAiAgent.slice(
        runAiAgent.indexOf("const PRIORITY_TOOLS = new Set(["),
        runAiAgent.indexOf("function capToolsForTarget("),
      );
      assert(priority.includes('"refresh_campaign_pulse"'));
      assert(runAiAgent.includes("  REFRESH_CAMPAIGN_PULSE_TOOL,\n"));
      const catalog = read("../../../src/lib/agentToolsCatalog.ts");
      assert(catalog.includes('name: "refresh_campaign_pulse"'));
    },
  );

  await t.step(
    "V1 and the memory tools no longer send the pulse through recall_recent_action",
    () => {
      assert(!runAiAgent.includes("לפני הרצה של pulse_check"));
      assert(!runAiAgent.includes("בסיום של pulse_check"));
      assertMatch(
        runAiAgent,
        /לפני סקירת קמפיינים \/ סקירת לידים \/ כל פעולה כבדה חוזרת — חובה לקרוא קודם ל-recall_recent_action\(action_type, max_age_hours=8\)\. בדיקת דופק לא צריכה את זה/,
      );
    },
  );
});
