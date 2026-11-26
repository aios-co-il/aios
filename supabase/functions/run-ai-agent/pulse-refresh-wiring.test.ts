import { readRunStages } from "./run-source.test-fixture.ts";
import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
} from "jsr:@std/assert@1";
import {
  ECOMMERCE_PULSE_SKILL_ROW,
  PULSE_CHECK_SKILL_ROW,
} from "../_shared/skills/pulse-skill-rows.ts";
import { REFRESH_CAMPAIGN_PULSE_TOOL } from "./pulse-refresh/tool.ts";
import { ALL_TOOLS } from "./tool-catalog.ts";

const read = (path: string) =>
  Deno.readTextFileSync(new URL(path, import.meta.url));
const runAiAgent = readRunStages() + "\n" + read("./index.ts");

// Source guards follow the extracted owners; full-run parity tests cover assembled requests.
Deno.test("run-ai-agent index.ts", async (t) => {
  await t.step(
    "run-ai-agent appends the pulse block after the V1/V2 branch and wires the refresh tool",
    () => {
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
        /case REFRESH_PULSE_TOOL_NAME:\s*return executeRefreshCampaignPulseTool\(/,
      );
      assertMatch(
        read("./executors/refresh-campaign-pulse.ts"),
        /actorUserId,\s*accessibleTenantIds,\s*assertCallerCanAccessClient: \(clientId: string\) =>\s*assertCallerCanAccessClient\(supabase, clientId, callerScope\),/,
      );
      assert(ALL_TOOLS.includes(REFRESH_CAMPAIGN_PULSE_TOOL));

      const catalog = read("../../../src/lib/agentToolsCatalog.ts");
      assert(catalog.includes("name: REFRESH_PULSE_TOOL_NAME,"));
    },
  );

  await t.step(
    "a tenant pulse skin cannot override the pulse block or hide the refresh tool",
    () => {
      // A narrow allowed_tools still offers both pulse tools to Carmen,
      // before the router picks this message's tools, and on direct_tool.
      const keep = runAiAgent.indexOf(
        "filteredTools = keepCarmenPulseTools(filteredTools, ALL_TOOLS, {",
      );
      assert(
        keep > runAiAgent.indexOf("allowedTools.includes(t.name) ||"),
        "the refresh tool is kept after allowed_tools narrows the pool",
      );
      assert(keep < runAiAgent.indexOf("await selectRelevantToolsForMessage("));
      // An unidentified WhatsApp or task caller keeps the narrow list.
      assertMatch(
        runAiAgent.slice(keep),
        /^[^}]*caller: \{\s*surface,\s*callerCampaignerId,\s*callerUserId,?\s*\},/,
      );
      assertMatch(
        runAiAgent,
        /const pool = keepCarmenPulseTools\(\s*directToolPool\(ALL_TOOLS(?: as Array<any>)?, \{/,
      );
      // Nor do matched or pinned skins hand that caller the pulse tools.
      assertMatch(
        runAiAgent,
        /skinDisabledTools = skinToolDenylist\(disabledTools, \{\s*surface,\s*callerCampaignerId,\s*callerUserId,\s*\}\);/,
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
    const toolNames = new Set(ALL_TOOLS.map((tool) => tool.name));
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
