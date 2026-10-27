import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { v2Prompt } from "../../_shared/carmen/fake-v2-prompt.ts";
import {
  appendCarmenPulseRules,
  buildCarmenPulseRulesBlock,
  CARMEN_PULSE_RULES_VERSION,
} from "./rules-block.ts";

const blockHeader = `=== כללי דופק קמפיינים (גרסה ${CARMEN_PULSE_RULES_VERSION})`;

Deno.test("appendCarmenPulseRules", async (t) => {
  await t.step(
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

  await t.step("the block is appended once, only for Carmen", () => {
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
});

Deno.test("buildCarmenPulseRulesBlock", async (t) => {
  await t.step(
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

  await t.step("the block names the 10-minute refresh limit", () => {
    assertMatch(buildCarmenPulseRulesBlock(), /פעם ב-10 דקות לארגון/);
  });
});
