import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  ECOMMERCE_PULSE_SKILL_ROW,
  PULSE_CHECK_SKILL_ROW,
} from "../_shared/skills/pulse-skill-rows.ts";
import { REFRESH_CAMPAIGN_PULSE_TOOL } from "./pulse-refresh/tool.ts";

const read = (path: string) =>
  Deno.readTextFileSync(new URL(path, import.meta.url));
const runAiAgent = read("./index.ts");

// These steps read index.ts as text: handleRunAgent is too large to run with
// fakes here. A handler-level test waits for its prompt assembly and tool pool
// to move out of index.ts (AIO-123).
Deno.test("run-ai-agent index.ts", async (t) => {
  await t.step(
    "run-ai-agent appends the pulse block after the V1/V2 branch and wires the refresh tool",
    () => {
      const v1Start = runAiAgent.indexOf("// ─── V1 PROMPT BUILDING");
      const append = runAiAgent.indexOf(
        "systemPrompt = appendCarmenPulseRules(systemPrompt, {",
      );
      const systemMessage = runAiAgent.indexOf(
        'const messages: any[] = [{ role: "system", content: systemPrompt }];',
      );
      assert(runAiAgent.indexOf("if (shouldUseV2Prompt(agent)) {") < v1Start);
      assert(append > v1Start && append < systemMessage);
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
      // The log names the block version only for runs that get the block.
      assertMatch(
        runAiAgent,
        /pulse_rules=\$\{carmenPulseRulesVersion\(\{ isCarmen, pinSkillsOnly \}\)\}/,
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
        /toolName === REFRESH_PULSE_TOOL_NAME &&\s*pulseRefreshRoute\.digestShortcut\s*\) \{\s*pulseDigestShortcut = buildPulseRefreshDigestReply\(result\);/,
      );
      assert(!runAiAgent.includes("isPulseRefreshRequest("));
      // The tool runs with executeTool's caller and scope.
      assertMatch(
        runAiAgent,
        /case REFRESH_PULSE_TOOL_NAME: \{\s*return await executeRefreshCampaignPulse\(\s*\{[^}]*actorUserId,\s*accessibleTenantIds,\s*assertCallerCanAccessClient: \(clientId: string\) =>\s*assertCallerCanAccessClient\(supabase, clientId, callerScope\),/,
      );
      const priority = runAiAgent.slice(
        runAiAgent.indexOf("const PRIORITY_TOOLS = new Set(["),
        runAiAgent.indexOf("function capToolsForTarget("),
      );
      assert(priority.includes("  REFRESH_PULSE_TOOL_NAME,\n"));
      assert(runAiAgent.includes("  REFRESH_CAMPAIGN_PULSE_TOOL,\n"));
      const catalog = read("../../../src/lib/agentToolsCatalog.ts");
      assert(catalog.includes("name: REFRESH_PULSE_TOOL_NAME,"));
    },
  );

  await t.step(
    "a tenant pulse skin cannot override the pulse block or hide the refresh tool",
    () => {
      const append = runAiAgent.indexOf(
        "systemPrompt = appendCarmenPulseRules(systemPrompt, {",
      );
      const systemMessage = runAiAgent.indexOf(
        'const messages: any[] = [{ role: "system", content: systemPrompt }];',
      );
      // Every place a skin's text joins the prompt. Tenant pulse_check and
      // ecommerce_pulse overrides (DMM, MarketingCaptain) that say not to
      // refresh arrive as trigger-matched skins in activeSkillsBlock.
      for (const skinText of [
        "systemPrompt += pinnedBlock;",
        "systemPrompt += await activeSkinBlock({",
        "systemPrompt += activeSkillsBlock;",
      ]) {
        const at = runAiAgent.indexOf(skinText);
        assert(at > 0, `${skinText} is in run-ai-agent`);
        assert(at < append, `${skinText} comes before the pulse block`);
      }
      // After the block only the approval flow adds to the prompt, so any
      // other text added there later (a skin, a memory) fails here.
      const approvalFlowAdds = [
        "systemPrompt += `\\n\\n🧾 הנחיה חדשה נשמרה לזיכרון אוטומטית",
        "systemPrompt += buildApprovalConfirmPromptRule(pendingForConfirm);",
        "systemPrompt += `\\n\\n${recoveryPayload.instruction_for_carmen}`;",
        "systemPrompt += `\\n[recovery_json]=",
        "systemPrompt += `\\n\\n🚫 המשתמש דחה.",
      ];
      const addsAfterBlock = runAiAgent
        .slice(append, systemMessage)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^systemPrompt\s*(\+=|=)/.test(line))
        .slice(1);
      assertStrictEquals(addsAfterBlock.length, approvalFlowAdds.length);
      for (const line of addsAfterBlock) {
        assert(
          approvalFlowAdds.some((allowed) => line.startsWith(allowed)),
          `added after the pulse block: ${line}`,
        );
      }
      // Nor may a later system message or an edit of the first one add
      // prompt text after the block once the messages array exists.
      const turn = runAiAgent.slice(
        systemMessage,
        runAiAgent.indexOf("async function handleDirectTool("),
      );
      assertStrictEquals(
        turn.match(/role:\s*["'`]system["'`]/g)?.length,
        1,
        "the only system message is the one that carries systemPrompt",
      );
      assertNotMatch(
        turn,
        /messages\s*\[\s*0\s*\]|messages\.(unshift|splice)\(/,
      );
      // A narrow allowed_tools still offers both pulse tools to Carmen,
      // before the router picks this message's tools, and on direct_tool.
      const keep = runAiAgent.indexOf(
        "filteredTools = keepCarmenPulseTools(filteredTools, ALL_TOOLS, {",
      );
      assert(
        keep >
          runAiAgent.indexOf(
            "ALL_TOOLS.filter((t) => allowedTools.includes(t.name))",
          ),
        "the refresh tool is kept after allowed_tools narrows the pool",
      );
      assert(keep < runAiAgent.indexOf("await selectRelevantToolsForMessage("));
      // An unidentified WhatsApp or task caller keeps the narrow list.
      assertMatch(
        runAiAgent.slice(keep),
        /^[^}]*caller: \{ surface, callerCampaignerId, callerUserId \},/,
      );
      assertMatch(
        runAiAgent,
        /const pool = keepCarmenPulseTools\(\s*directToolPool\(ALL_TOOLS, \{/,
      );
      // Nor do matched or pinned skins hand that caller the pulse tools.
      assertMatch(
        runAiAgent,
        /const skinDisabledTools = skinToolDenylist\(disabledTools, \{\s*surface,\s*callerCampaignerId,\s*callerUserId,\s*\}\);/,
      );
      const skinPromotions = [
        ...runAiAgent.matchAll(
          /missingEnabledTools\(\s*filteredTools,\s*ALL_TOOLS,\s*[^,]+,\s*(\w+),\s*\)/g,
        ),
      ].map((m) => m[1]);
      assertEquals(skinPromotions, ["skinDisabledTools", "skinDisabledTools"]);
    },
  );

  await t.step("pulse skins only name tools that run-ai-agent offers", () => {
    const toolNames = new Set(
      [...runAiAgent.matchAll(/^\s{4}name: "([a-z0-9_]+)",$/gm)].map(
        (m) => m[1],
      ),
    );
    toolNames.add(REFRESH_CAMPAIGN_PULSE_TOOL.name);
    for (const row of [PULSE_CHECK_SKILL_ROW, ECOMMERCE_PULSE_SKILL_ROW]) {
      for (const tool of row.allowed_tools) {
        assert(toolNames.has(tool), `${row.slug} → ${tool}`);
      }
      const text = [row.system_prompt, row.constraints, row.steps].join("\n");
      for (const mentioned of text.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) || []) {
        // Output fields and tool arguments, not tools.
        const field =
          /_(7d|pct)$|^is_|^client_(id|name)$|^formatted_markdown$|^whatsapp_digest$|^refresh_note$/;
        if (field.test(mentioned)) {
          continue;
        }
        assert(toolNames.has(mentioned), `${row.slug} mentions ${mentioned}`);
      }
    }
    assertNotMatch(
      JSON.stringify(ECOMMERCE_PULSE_SKILL_ROW),
      /list_shopify_orders|list_woocommerce_orders/,
    );
  });

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
