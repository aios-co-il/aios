import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildVoiceInstructions,
  type VoiceAgentProfile,
} from "./voice-instructions.ts";

const profile: VoiceAgentProfile = {
  systemPrompt: null,
  writingStyle: null,
  responseLength: null,
  voice: null,
  tenantName: "Demo",
};

Deno.test(
  "voice answers everything, including introductions and general questions",
  () => {
    const text = buildVoiceInstructions(profile, "דוד");
    assert(!text.includes("אין לי זמן"));
    assert(!text.includes("לא עוזרת אישית"));
    assertStringIncludes(text, "להציג את עצמך");
    assertStringIncludes(text, "ask_carmen");
    assertStringIncludes(text, "דוד");
  },
);

Deno.test(
  "voice uses the agent's own system prompt and tone, like the text chat",
  () => {
    const text = buildVoiceInstructions(
      {
        ...profile,
        systemPrompt: "את כרמן, הנחיה מותאמת.",
        writingStyle: "friendly",
        responseLength: "short",
      },
      null,
    );
    assertStringIncludes(text, "את כרמן, הנחיה מותאמת.");
    assertStringIncludes(text, "חברותי");
    assertStringIncludes(text, "2-3 משפטים");
  },
);

Deno.test(
  "without a custom prompt, voice uses Carmen's shared identity",
  () => {
    assertStringIncludes(
      buildVoiceInstructions(profile, null),
      "מנהלת השיווק של Marketing Captain ושל הארגון Demo",
    );
  },
);
