import { assertStringIncludes } from "jsr:@std/assert@1";
import { FULL_BRAIN_TOOL, fastLaneInstructions } from "./instructions.ts";

const brief = {
  agencies: [{ name: "דורון אקו", shared: false, clients: ["אקו", "M&M"] }],
  otherClients: [],
  team: [{ name: "דוד", roles: ["owner"] }],
  today: ["דוד ביקש עדכון שבועי ללקוחות"],
};

Deno.test(
  "the fast model knows the org and hands live data to the full brain",
  () => {
    const text = fastLaneInstructions({
      agentName: "כרמן",
      addressLine: "\n\n🙋 פנייה למשתמש: דוד.",
      brief,
      now: new Date("2026-11-07T20:15:00Z"),
    });
    assertStringIncludes(text, "את כרמן");
    assertStringIncludes(text, `יש לך כלי אחד: ${FULL_BRAIN_TOOL}`);
    assertStringIncludes(text, "- סוכנות דורון אקו: אקו, M&M");
    assertStringIncludes(text, "דוד ביקש עדכון שבועי ללקוחות");
    assertStringIncludes(text, "22:15");
    assertStringIncludes(text, "פנייה למשתמש: דוד.");
  },
);
