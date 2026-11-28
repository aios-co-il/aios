import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { personaPromptSection } from "./persona-prompt.ts";
import { BUILTIN_PERSONAS } from "./personas.ts";

const MALE_LINE = /דבר על עצמך בלשון זכר/;

describe("personaPromptSection", () => {
  it("names the character and keeps the rules", () => {
    const section = personaPromptSection({
      persona: BUILTIN_PERSONAS.minime,
      chosenBy: "user",
      gender: "female",
    });

    assertMatch(section, /הדמות שהמשתמש בחר עבורך היא "מיני מי"/);
    assertMatch(section, /אני מיני מי/);
    assertMatch(section, /כללי האישור שלך לא משתנים/);
    assertNotMatch(section, /אישיות והתנהגות/);
  });

  it("says the organization chose a character the user did not pick", () => {
    const section = personaPromptSection({
      persona: BUILTIN_PERSONAS.minime,
      chosenBy: "organization",
      gender: "male",
    });

    assertMatch(section, /הדמות שהארגון בחר עבורך היא "מיני מי"/);
    assertNotMatch(section, /המשתמש בחר/);
  });

  it("tells a male character to speak of himself in the masculine, and only him", () => {
    const male = personaPromptSection({
      persona: BUILTIN_PERSONAS.minime,
      chosenBy: "user",
      gender: "male",
    });
    const female = personaPromptSection({
      persona: BUILTIN_PERSONAS.carmen,
      chosenBy: "user",
      gender: "female",
    });

    assertMatch(male, MALE_LINE);
    assertNotMatch(female, MALE_LINE);
  });

  it("adds personality, soul and writing style when set", () => {
    const section = personaPromptSection({
      persona: {
        ...BUILTIN_PERSONAS.carmen,
        personality: "חדה וישירה",
        soul: "שאף ליד לא ייפול",
        writingStyle: "playful",
      },
      chosenBy: "user",
      gender: "female",
    });

    assertMatch(section, /אישיות והתנהגות: חדה וישירה/);
    assertMatch(section, /נשמה \/ מטרת קיום: שאף ליד לא ייפול/);
    assertMatch(section, /סגנון כתיבה: משחקי/);
  });
});
