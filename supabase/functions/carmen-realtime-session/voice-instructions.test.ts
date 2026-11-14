import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildIdentity,
  buildV1Identity,
  carmenHelpsAnyone,
} from "../_shared/carmen-prompt-v2.ts";
import { userAddressLine } from "../_shared/carmen/user-address.ts";
import {
  buildVoiceInstructions,
  type VoiceAgentProfile,
} from "./voice-instructions.ts";

const profile: VoiceAgentProfile = {
  systemPrompt: null,
  writingStyle: null,
  responseLength: null,
  useV2Prompt: false,
  moodPrompt: null,
  tenantName: "Demo",
  assistantName: "כרמן",
};

Deno.test(
  "voice answers everything, including introductions and general questions",
  () => {
    const text = buildVoiceInstructions(profile, userAddressLine("דוד", null));
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
      "",
    );
    assertStringIncludes(text, "את כרמן, הנחיה מותאמת.");
    assertStringIncludes(text, "חברותי");
    assertStringIncludes(text, "2-3 משפטים");
  },
);

Deno.test(
  "without a custom prompt, voice uses the identity the chat would use for the agent",
  () => {
    assertStringIncludes(
      buildVoiceInstructions(profile, ""),
      buildV1Identity("Demo", "כרמן"),
    );
    assertStringIncludes(
      buildVoiceInstructions({ ...profile, useV2Prompt: true }, ""),
      buildIdentity("Demo", "כרמן"),
    );
    assertStringIncludes(
      buildVoiceInstructions(null, ""),
      carmenHelpsAnyone("כרמן"),
    );
  },
);

Deno.test("voice applies the agent's mood and the manager guidance", () => {
  const text = buildVoiceInstructions(
    { ...profile, moodPrompt: "מצב רוח: בדיקה" },
    "",
  );
  assertStringIncludes(text, "מצב רוח: בדיקה");
  assertStringIncludes(text, "הציגי החלטה או צעד ניהולי הבא");
  assertStringIncludes(text, "עד שניים-שלושה משפטים קצרים");
  assertStringIncludes(text, "משפט קצר אחד לכל סוכנות או לקוח");
});

Deno.test(
  "voice waits for the user's request and runs a pulse check only when asked",
  () => {
    const text = buildVoiceInstructions(profile, "");
    assertStringIncludes(text, "המתיני שהמשתמש יגיד מה הוא רוצה");
    assert(!text.includes("שגיאת תמלול"));
  },
);

Deno.test(
  "voice addresses the caller by the profile gender, never as אליו/ה",
  () => {
    const male = buildVoiceInstructions(
      profile,
      userAddressLine("דוד", "male"),
    );
    assertStringIncludes(male, userAddressLine("דוד", "male").trim());
    assert(!male.includes("אליו/ה"));
    const unknown = buildVoiceInstructions(
      profile,
      userAddressLine(null, null),
    );
    assertStringIncludes(unknown, "בלשון רבים או ניטרלית");
  },
);

Deno.test(
  "voice never claims a phone send that did not happen and keeps a matter-of-fact tone",
  () => {
    const text = buildVoiceInstructions(null, "");
    assertStringIncludes(
      text,
      'אל תאמרי "נשלח" או "שלחתי" אלא אם send_whatsapp החזיר עכשיו שנשלח',
    );
    assertStringIncludes(text, "הוא לא רואה שליחות מהטלפון");
    assertStringIncludes(text, '"המוח שלי"');
    assertStringIncludes(text, "בלי תגיות רגש או קצב");
  },
);
