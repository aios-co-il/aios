import { assert, assertMatch, assertStringIncludes } from "jsr:@std/assert@1";
import { v2Prompt } from "./carmen/fake-v2-prompt.ts";

Deno.test("buildCarmenV2SystemPrompt pulse rules", async (t) => {
  await t.step(
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

  await t.step(
    "V2 no longer sends the pulse through recall_recent_action",
    () => {
      assertMatch(v2Prompt(null), /בדיקת דופק לא צריכה את זה/);
    },
  );
});

Deno.test(
  "buildCarmenV2SystemPrompt names the assistant as the org set it",
  async (t) => {
    await t.step(
      "a renamed org's assistant introduces herself by that name",
      () => {
        const prompt = v2Prompt(null, {
          visual_identity: { displayName: "מיני מי" },
        });
        assertStringIncludes(prompt, "את מיני מי, מנהלת השיווק");
        assertStringIncludes(prompt, '"אני מיני מי, מנהלת השיווק שלך.');
        assert(!prompt.includes("את כרמן, מנהלת השיווק"));
      },
    );

    await t.step("an org that did not rename keeps Carmen", () => {
      assertStringIncludes(v2Prompt(null), "את כרמן, מנהלת השיווק");
    });
  },
);
