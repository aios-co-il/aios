import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { v2Prompt } from "../../_shared/carmen/fake-v2-prompt.ts";
import {
  AGENCY_DATA_RULES_VERSION,
  agencyDataRulesVersion,
  appendAgencyDataRules,
} from "./rules-block.ts";

const header = `=== מבנה הנתונים: סוכנות ולקוחותיה (גרסה ${AGENCY_DATA_RULES_VERSION})`;

Deno.test("appendAgencyDataRules", async (t) => {
  await t.step("reaches V1, a custom prompt and V2, after the base", () => {
    const prompts = {
      v1: "את כרמן, מנהלת השיווק של Marketing Captain.",
      custom: "את עוזרת מותאמת אישית.",
      v2: v2Prompt(null),
    };
    for (const [name, base] of Object.entries(prompts)) {
      const finalPrompt = appendAgencyDataRules(base, { isCarmen: true });
      assert(finalPrompt.startsWith(base), name);
      assert(finalPrompt.lastIndexOf(header) >= base.length, name);
    }
  });

  await t.step(
    "tells Carmen that a client's leads come from reports, not list_leads",
    () => {
      const block = appendAgencyDataRules("", { isCarmen: true });
      assert(block.includes("שייכים לסוכנות עצמה"));
      assert(block.includes("get_latest_campaign_pulse"));
      assert(block.includes("get_facebook_campaign_data"));
      assert(block.includes("אסור לענות על זה מ-list_leads"));
    },
  );

  await t.step("other agents and pin_skills_only sessions get no block", () => {
    assertStrictEquals(appendAgencyDataRules("base", {}), "base");
    assertStrictEquals(
      appendAgencyDataRules("base", { isCarmen: true, pinSkillsOnly: true }),
      "base",
    );
    assertStrictEquals(agencyDataRulesVersion({ isCarmen: false }), "none");
    assertStrictEquals(
      agencyDataRulesVersion({ isCarmen: true }),
      AGENCY_DATA_RULES_VERSION,
    );
  });
});
