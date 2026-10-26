import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";
import {
  appendCarmenPulseRules,
  buildCarmenPulseRulesBlock,
  CARMEN_PULSE_RULES_VERSION,
  CARMEN_PULSE_SKILL_ROWS,
  ECOMMERCE_PULSE_SKILL_ROW,
} from "./carmen-pulse-rules.mjs";
import {
  hasPulseIntent,
  isCachedPulseRequest,
  isPulseRefreshRequest,
} from "./pulse-request.mjs";
import { buildCarmenV2SystemPrompt } from "./carmen-prompt-v2.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const runAiAgent = read("../run-ai-agent/index.ts");
const migration = read(
  "../../migrations/20261026131000_carmen_pulse_refresh.sql",
);
const blockHeader = `=== כללי דופק קמפיינים (גרסה ${CARMEN_PULSE_RULES_VERSION})`;

function v2Prompt(systemPrompt) {
  return buildCarmenV2SystemPrompt({
    agent: { name: "כרמן", system_prompt: systemPrompt },
    tenant: {
      tenantName: "סוכנות",
      tenantId: "t",
      ownAgencyList: "",
      sharedAgencyList: "",
      sharedAgenciesCount: 0,
      leadsByStatus: {},
      totalLeads: 0,
      activeClients: 0,
      openTasks: 0,
    },
    memory: { instructionItems: [], otherItems: [] },
    isWhatsApp: false,
    currentDate: "",
    currentTime: "",
    todayISO: "2026-10-26",
    tomorrowISO: "2026-10-27",
  });
}

Deno.test(
  "the block reaches V1 with an empty system_prompt, V1 with a custom one, and V2",
  () => {
    const prompts = {
      // V1 with an empty ai_agents.system_prompt builds its default identity.
      v1Empty: "את כרמן, מנהלת השיווק של Marketing Captain.",
      v1Custom: "את עוזרת מותאמת אישית. לעולם אל תרענני בדיקת דופק.",
      v2: v2Prompt(null),
      v2Custom: v2Prompt("פרומפט מותאם של הארגון."),
    };
    for (const [name, base] of Object.entries(prompts)) {
      const finalPrompt = appendCarmenPulseRules(base, {
        isCarmen: true,
        surface: "internal_chat",
      });
      assert(finalPrompt.startsWith(base), name);
      assert(finalPrompt.includes(blockHeader), name);
      assert(finalPrompt.includes("refresh_campaign_pulse"), name);
      // The block comes last, so it wins over older pulse rules in the base.
      assert(
        finalPrompt.lastIndexOf(blockHeader) > base.length - 1,
        `${name}: block is appended after the identity`,
      );
    }
  },
);

Deno.test("the block is appended once, only for Carmen", () => {
  const once = appendCarmenPulseRules("בסיס", { isCarmen: true });
  assertStrictEquals(appendCarmenPulseRules(once, { isCarmen: true }), once);
  assertStrictEquals(
    appendCarmenPulseRules("בסיס", { isCarmen: false }),
    "בסיס",
  );
  assertStrictEquals(appendCarmenPulseRules(null, { isCarmen: false }), "");
  // pin_skills_only sessions expose no tools, so the tool rules stay out.
  assertStrictEquals(
    appendCarmenPulseRules("בסיס", { isCarmen: true, pinSkillsOnly: true }),
    "בסיס",
  );
});

Deno.test(
  "the block maps each phrase to the right path and keeps approval",
  () => {
    const block = buildCarmenPulseRulesBlock({ surface: "aios" });
    assertMatch(block, /"דופק", "בדיקת דופק".*get_latest_campaign_pulse/);
    assertMatch(
      block,
      /"רענני דופק", "דופק עדכני", "בדיקת דופק מלאה ועדכנית".*refresh_campaign_pulse/,
    );
    assertMatch(block, /"בדיקת תקינות".*health probe — לא דופק/);
    assertMatch(block, /מותר לך להתחיל בעצמך בסקירת דופק/);
    assertMatch(block, /רק אחרי אישור מפורש/);
    assertNotMatch(block, /whatsapp_digest/);
    for (const surface of ["whatsapp", "task"]) {
      const wa = buildCarmenPulseRulesBlock({ surface });
      assertMatch(wa, /whatsapp_digest כלשונו/);
      assertMatch(wa, /refresh_note/);
    }
  },
);

Deno.test(
  "run-ai-agent appends the block after the V1/V2 branch and logs its version",
  () => {
    const branchStart = runAiAgent.indexOf("if (shouldUseV2Prompt(agent)) {");
    const v1Start = runAiAgent.indexOf("// ─── V1 PROMPT BUILDING");
    const append = runAiAgent.indexOf(
      "systemPrompt = appendCarmenPulseRules(systemPrompt, {\n      isCarmen,\n      surface,\n      pinSkillsOnly,\n    });",
    );
    const filterTools = runAiAgent.indexOf("// 4. Filter tools");
    assert(branchStart > 0 && v1Start > branchStart);
    assert(append > v1Start && append < filterTools);
    // Both branches flow into the append: it is not nested in either of them.
    const between = runAiAgent.slice(v1Start, append);
    assert(
      between.includes("// ─── Command Center (internal_chat) rendering layer"),
    );
    assertStrictEquals(
      runAiAgent.split("appendCarmenPulseRules(").length - 1,
      1,
      "appended exactly once",
    );
    // The old WhatsApp-only pulse block is gone (folded into the shared block).
    assert(!runAiAgent.includes("📱 === בדיקת דופק בוואטסאפ (חובה) ==="));
    assertMatch(
      runAiAgent,
      /prompt_version=\$\{shouldUseV2Prompt\(agent\) \? "v2" : "v1"\} pulse_rules=\$\{isCarmen \? CARMEN_PULSE_RULES_VERSION : "none"\}/,
    );
  },
);

Deno.test(
  "V2 iron rule 2 lets Carmen start a pulse review but keeps approval",
  () => {
    const prompt = v2Prompt(null);
    assert(!prompt.includes("אסור ליזום סקירת קמפיינים"));
    assert(!prompt.includes("שגרות יומיות / pulse_check / heartbeat"));
    assertMatch(prompt, /🔒 \*\*2\. סקירה מותרת, שינוי רק באישור\.\*\*/);
    assertMatch(prompt, /כל פעולה על קמפיין עוברת דרך חוק 1/);
    assert(!prompt.includes("אסור ליצור או לרענן Snapshot"));
    assertMatch(prompt, /"רענני דופק".*refresh_campaign_pulse/);
  },
);

Deno.test(
  "refresh phrases go to refresh_campaign_pulse; bare requests keep the fast path",
  () => {
    for (const text of [
      "רענני דופק",
      "רענני בדיקת דופק",
      "דופק עדכני",
      "תני לי דופק מעודכן",
      "בדיקת דופק מלאה ועדכנית לפי סוכנויות",
      "תריצי את הדופק מחדש",
      "refresh pulse check",
    ]) {
      assertStrictEquals(isPulseRefreshRequest(text), true, text);
      assertStrictEquals(isCachedPulseRequest(text), false, text);
    }
    for (const text of ["דופק", "בדיקת דופק", "מצב קמפיינים", "pulse check"]) {
      assertStrictEquals(isCachedPulseRequest(text), true, text);
      assertStrictEquals(isPulseRefreshRequest(text), false, text);
    }
    for (const text of [
      "רענני את המשימות",
      "בדיקת תקינות מערכות וקמפיינים",
      "עדכני את הלקוח",
    ]) {
      assertStrictEquals(
        hasPulseIntent(text) && isPulseRefreshRequest(text),
        false,
      );
    }
  },
);

Deno.test(
  "run-ai-agent forces refresh_campaign_pulse on refresh phrases and keeps it in PRIORITY_TOOLS",
  () => {
    // Routing comes from decidePulseRefreshRouting with the resolved caller.
    assertMatch(
      runAiAgent,
      /const pulseRefreshRoute = decidePulseRefreshRouting\(\{\s*text: cmd,\s*isCarmen,\s*pinSkillsOnly,\s*digestSurface: pulseSurfacePrefersWhatsAppDigest\(surface\),\s*caller: \{\s*campaignerId: callerCampaignerId,\s*userId: callerUserId,\s*role: callerRole,\s*\},\s*\}\);/,
    );
    // The digest shortcut is gated on the bare-request route only.
    assertMatch(
      runAiAgent,
      /toolName === "refresh_campaign_pulse" &&\s*pulseRefreshRoute\.digestShortcut\s*\) \{\s*pulseDigestShortcut = buildPulseRefreshDigestReply\(result\);/,
    );
    assert(!runAiAgent.includes("isPulseRefreshRequest("));
    // The tool learns who is asking, so WhatsApp strangers are refused.
    assertMatch(
      runAiAgent,
      /runCampaignPulseRefresh\(\s*\{\s*tenantId,\s*clientId: args\.client_id,\s*surface,\s*callerCampaignerId,\s*callerUserId: actorUserId,\s*\}/,
    );
    assertMatch(
      runAiAgent,
      /accessibleTenantIds,\s*assertCallerCanAccessClient: \(clientId: string\) =>\s*assertCallerCanAccessClient\(supabase, clientId, callerScope\),/,
    );
    const priority = runAiAgent.slice(
      runAiAgent.indexOf("const PRIORITY_TOOLS = new Set(["),
      runAiAgent.indexOf("function capToolsForTarget("),
    );
    assert(priority.includes('"refresh_campaign_pulse"'));
    assert(runAiAgent.includes('name: "refresh_campaign_pulse",'));
    assert(runAiAgent.includes('case "refresh_campaign_pulse": {'));
    assertMatch(
      runAiAgent,
      /pulseRefreshRoute\.forceRefresh &&[\s\S]{0,200}function: \{ name: "refresh_campaign_pulse" \}/,
    );
    const catalog = read("../../../src/lib/agentToolsCatalog.ts");
    assert(catalog.includes('name: "refresh_campaign_pulse"'));
  },
);

Deno.test(
  "the migration writes the same skin text as the registry fallback",
  () => {
    const registry = read("./skills/registry.ts");
    assertMatch(
      registry,
      /fallbackFromSkillRow\(\s*PULSE_CHECK_SKILL_ROW,?\s*\)/,
    );
    assertMatch(
      registry,
      /fallbackFromSkillRow\(\s*ECOMMERCE_PULSE_SKILL_ROW,?\s*\)/,
    );
    for (const row of CARMEN_PULSE_SKILL_ROWS) {
      for (const field of [
        "name",
        "description",
        "goal",
        "system_prompt",
        "constraints",
        "steps",
        "output_template",
      ]) {
        if (row[field] === null) continue;
        assert(
          migration.includes(`$$${row[field]}$$`),
          `${row.slug}.${field} matches the migration`,
        );
      }
      const quote = (values) =>
        `ARRAY[${values.map((v) => `'${v}'`).join(", ")}]::text[]`;
      assert(migration.includes(quote(row.allowed_tools)), row.slug);
      assert(migration.includes(quote(row.triggers)), row.slug);
      assert(migration.includes(`'${row.slug}',\n  'global',`), row.slug);
    }
    assertMatch(
      migration,
      /ON CONFLICT \(slug\) WHERE scope = 'global' DO UPDATE/,
    );
    // Tenant overrides are counted, never updated.
    assertNotMatch(
      migration,
      /UPDATE public\.ai_skills[\s\S]*scope = 'tenant'/,
    );
  },
);

Deno.test("pulse skins only name tools that exist", () => {
  const toolNames = new Set(
    [...runAiAgent.matchAll(/^\s{4}name: "([a-z0-9_]+)",$/gm)].map((m) => m[1]),
  );
  for (const row of CARMEN_PULSE_SKILL_ROWS) {
    for (const tool of row.allowed_tools) {
      assert(toolNames.has(tool), `${row.slug} → ${tool}`);
    }
    const text = [row.system_prompt, row.constraints, row.steps].join("\n");
    for (const mentioned of text.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) || []) {
      // Output fields and tool arguments, not tools.
      if (
        /_(7d|pct)$|^is_|^client_(id|name)$|^formatted_markdown$|^whatsapp_digest$|^refresh_note$/.test(
          mentioned,
        )
      )
        continue;
      assert(toolNames.has(mentioned), `${row.slug} mentions ${mentioned}`);
    }
  }
  const ecommerceText = JSON.stringify(ECOMMERCE_PULSE_SKILL_ROW);
  assertNotMatch(ecommerceText, /list_shopify_orders|list_woocommerce_orders/);
});

Deno.test("the claim table and function are locked to the service role", () => {
  assertMatch(
    migration,
    /ALTER TABLE public\.campaign_pulse_refresh_claims ENABLE ROW LEVEL SECURITY;/,
  );
  assertMatch(
    migration,
    /REVOKE ALL ON TABLE public\.campaign_pulse_refresh_claims FROM PUBLIC, anon, authenticated;/,
  );
  assertMatch(
    migration,
    /REVOKE ALL ON FUNCTION public\.claim_campaign_pulse_refresh\(uuid, integer, uuid\)\s+FROM PUBLIC, anon, authenticated;/,
  );
  assertMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.claim_campaign_pulse_refresh\(uuid, integer, uuid\)\s+TO service_role;/,
  );
});

Deno.test(
  "V1 and the memory tools no longer send the pulse through recall_recent_action",
  () => {
    assert(!runAiAgent.includes("לפני הרצה של pulse_check"));
    assert(!runAiAgent.includes("בסיום של pulse_check"));
    assertMatch(
      runAiAgent,
      /לפני סקירת קמפיינים \/ סקירת לידים \/ כל פעולה כבדה חוזרת — חובה לקרוא קודם ל-recall_recent_action\(action_type, max_age_hours=8\)\. בדיקת דופק לא צריכה את זה/,
    );
    // V2 says the same.
    assertMatch(v2Prompt(null), /בדיקת דופק לא צריכה את זה/);
  },
);

Deno.test("pulse_check keeps the client-call details of the live text", () => {
  const text = CARMEN_PULSE_SKILL_ROWS.find(
    (row) => row.slug === "pulse_check",
  ).system_prompt;
  assertMatch(text, /לא תועדה שיחה ב-14 הימים האחרונים/);
  assertMatch(text, /עדכון שבועי שאומר בחיוב.*נחשב שיחה/);
  assertMatch(text, /"לא הצלחתי לדבר" לא נחשב/);
});

Deno.test(
  "the migration inserts triggers sorted, so a re-run changes nothing",
  () => {
    for (const row of CARMEN_PULSE_SKILL_ROWS) {
      const literal = `ARRAY[${row.triggers.map((v) => `'${v}'`).join(", ")}]::text[]`;
      assert(
        migration.includes(
          `ARRAY(\n    SELECT DISTINCT phrase\n    FROM unnest(${literal}) AS phrase\n    ORDER BY phrase\n  ),`,
        ),
        row.slug,
      );
    }
  },
);
