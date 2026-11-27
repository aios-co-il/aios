import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { personaPromptSection } from "./persona-prompt.ts";
import { BUILTIN_PERSONAS } from "./personas.ts";

describe("personaPromptSection", () => {
  it("names the character and keeps the rules", () => {
    const section = personaPromptSection(BUILTIN_PERSONAS.minime);
    assertMatch(section, /כ"מיני מי"/);
    assertMatch(section, /אני מיני מי/);
    assertMatch(section, /כללי האישור שלך לא משתנים/);
    assertNotMatch(section, /אישיות והתנהגות/);
  });

  it("adds personality, soul and writing style when set", () => {
    const section = personaPromptSection({
      ...BUILTIN_PERSONAS.carmen,
      personality: "חדה וישירה",
      soul: "שאף ליד לא ייפול",
      writingStyle: "playful",
    });
    assertMatch(section, /אישיות והתנהגות: חדה וישירה/);
    assertMatch(section, /נשמה \/ מטרת קיום: שאף ליד לא ייפול/);
    assertMatch(section, /סגנון כתיבה: משחקי/);
  });
});
