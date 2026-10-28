import { assert, assertEquals, assertNotMatch } from "jsr:@std/assert@1";
import {
  PULSE_WORDING_MAX_CHARS,
  sanitizePulseWordingLine,
} from "./wording-line.ts";

Deno.test("sanitizePulseWordingLine", async (t) => {
  await t.step("wording lines are single, plain and capped", () => {
    const allowed = new Set(["3"]);
    assertEquals(
      sanitizePulseWordingLine("  *חשוב*\n_לבדוק_ ~פיקסל~ `קוד`  ", allowed),
      { ok: true, text: "חשוב לבדוק פיקסל קוד" },
    );
    assertEquals(sanitizePulseWordingLine("‏הקמפיין‫ מעל\tהיעד⁩", allowed), {
      ok: true,
      text: "הקמפיין מעל היעד",
    });
    assertEquals(
      sanitizePulseWordingLine("סיכום כרמן: הקמפיין מעל היעד", allowed),
      { ok: true, text: "הקמפיין מעל היעד" },
    );

    const long = sanitizePulseWordingLine("מילה ".repeat(100), allowed);
    assert(long.ok);
    assert(long.text.length <= PULSE_WORDING_MAX_CHARS);
    assert(long.text.endsWith("…"));

    assertEquals(sanitizePulseWordingLine("ב־٣ ימים", allowed), {
      ok: false,
      reason: "invented_number",
    });
    assertEquals(sanitizePulseWordingLine("ראו https://x.example", allowed), {
      ok: false,
      reason: "invalid_text",
    });
    assertEquals(sanitizePulseWordingLine({ text: "x" }, allowed), {
      ok: false,
      reason: "invalid_text",
    });
    assertEquals(sanitizePulseWordingLine("   ", allowed), {
      ok: false,
      reason: "missing",
    });
  });

  await t.step("wording checks run on the shortened text that is shown", () => {
    const allowed = new Set(["1234"]);
    // No space between 120 and 239, so the cut falls inside "1234".
    const split = sanitizePulseWordingLine(
      `הקמפיין ${"א".repeat(PULSE_WORDING_MAX_CHARS - 12)}1234 ומעבר`,
      allowed,
    );
    assertEquals(split, { ok: false, reason: "invented_number" });

    // A link that only survives in the dropped tail is not shown, so the
    // shown part passes; one that reaches the shown part is rejected.
    const tail = sanitizePulseWordingLine(
      `${"מילה ".repeat(60)}https://x.example`,
      allowed,
    );
    assert(tail.ok);
    assertNotMatch(tail.text, /https|example/);
    assertEquals(
      sanitizePulseWordingLine(
        `${"מילה ".repeat(10)}1234 ראו https://x.example`,
        allowed,
      ),
      { ok: false, reason: "invalid_text" },
    );
  });

  await t.step("wording rejects other numerals and bare domains", () => {
    const allowed = new Set(["30", "52.5"]);
    for (const text of [
      "עלייה של ²⁵",
      "שלב ① בבדיקה",
      "פרק Ⅻ",
      "חצי ½ מהיעד",
    ]) {
      assertEquals(
        sanitizePulseWordingLine(text, allowed),
        { ok: false, reason: "invented_number" },
        text,
      );
    }

    for (const text of [
      "להיכנס ל־aios-login.co.il ולאשר",
      "לשלוח ל־wa.me/972500000000",
      "לבדוק ב-Example.COM",
    ]) {
      assertEquals(
        sanitizePulseWordingLine(text, allowed),
        { ok: false, reason: "invalid_text" },
        text,
      );
    }

    assertEquals(sanitizePulseWordingLine("CPL 52.5 מעל יעד 30.", allowed), {
      ok: true,
      text: "CPL 52.5 מעל יעד 30.",
    });
  });

  await t.step(
    "a percentage or a number in words never passes, with or without a digit",
    () => {
      for (const allowed of [
        new Set<string>(),
        new Set(["30", "52", "3 ימים", "7 ימים"]),
      ]) {
        for (const text of [
          "שלושים אחוז מעל היעד",
          "עלייה של עשרות אחוזים בעלות לליד",
          "ה-ROAS ירד בעשרות אחוזים",
          "העלות לליד כמעט כפולה מהיעד",
          "הכפלת העלות לליד ביחס ליעד",
          "העלות לליד הגיעה לכפל היעד",
          "העלות לליד מוכפלת מהיעד",
          "אפס לידים מאז השינוי",
          "שלושה ימים ברציפות מעל היעד",
          "ששה ימים ברציפות מעל היעד",
          "חמשה ימים ברציפות מעל היעד",
          "שלשה ימים ברציפות",
          "מאתים שקל",
          "מליון שקל",
          "עשירית מהיעד",
          "ליד אחד בלבד מאז השינוי",
          "רק ליד אחד הגיע השבוע למרות ההוצאה",
          "ליד אחד השבוע",
          "הקמפיין הביא ליד אחד היום",
          "מודעה אחת הושהתה",
          "קמפיין אחד הוציא את רוב התקציב",
          "פעם אחת השבוע",
          "רק ליד אחד מהקמפיין הזה",
          "הליד האחד שהגיע",
          "יותר מאחד",
          "העלות שילשה את עצמה",
          "העלות שולשו",
          "העלות התשלשה",
          "לבדוק אם העלות שילשה את עצמה מאז השינוי",
          "העלות מרובעת",
          "העלות ריבעה את עצמה",
          "שְׁלוֹשָׁה ימים מעל היעד",
          "עלייה דו-ספרתית בעלות",
          "ליד יחיד מאז השינוי",
          "ליד בודד מאז השינוי",
          "חמישת הימים האחרונים",
          "העלות לליד פי שניים מהיעד",
          "ירידה של 52 %",
          "ירידה של ٪ בהמרות",
          "ROAS down by thirty percent",
          "CPL doubled vs target",
          "twice the target",
          "ROAS is half the target",
          "only one lead since the change",
          "a single lead since the change",
          "a quarter of the target",
          "a third of the target",
        ]) {
          assertEquals(
            sanitizePulseWordingLine(text, allowed),
            { ok: false, reason: "invented_number" },
            text,
          );
        }
      }

      // A multiplier stays a claim when its digit is a known value (a ROAS
      // target of 3).
      for (const text of ["ROAS פי3 מהיעד", "ROAS x3 מהיעד", "ROAS 3× מהיעד"]) {
        assertEquals(
          sanitizePulseWordingLine(text, new Set(["3"])),
          { ok: false, reason: "invented_number" },
          text,
        );
      }
    },
  );

  await t.step("a minus sign is never dropped; only a bullet dash is", () => {
    const allowed = new Set(["30", "52"]);
    // A signed number is rejected whole, never shown without its sign.
    for (const text of [
      "-52 לליד",
      "סיכום כרמן: -52 לליד",
      "- -52 לליד",
      "−52 לליד",
      "-30% בהמרות",
    ]) {
      assertEquals(
        sanitizePulseWordingLine(text, allowed),
        { ok: false, reason: "invented_number" },
        text,
      );
    }

    assertEquals(sanitizePulseWordingLine("- 52 לליד", allowed), {
      ok: true,
      text: "52 לליד",
    });
    assertEquals(
      sanitizePulseWordingLine("• בדיקה מומלצת: - לבדוק את הפיקסל", allowed),
      { ok: true, text: "לבדוק את הפיקסל" },
    );
    // "ב-52" is a Hebrew prefix, not a minus sign.
    assertEquals(sanitizePulseWordingLine("העלות לליד עלתה ב-52", allowed), {
      ok: true,
      text: "העלות לליד עלתה ב-52",
    });
  });

  await t.step("a repeated label right after a bare dash is dropped", () => {
    const allowed = new Set(["30"]);
    for (const [text, expected] of [
      ["-בדיקה מומלצת: לבדוק את הפיקסל", "לבדוק את הפיקסל"],
      ["—סיכום כרמן: הקמפיין מעל היעד", "הקמפיין מעל היעד"],
      ["–סיכום: הקמפיין מעל יעד 30", "הקמפיין מעל יעד 30"],
      ["בדיקה מומלצת: -לבדוק את הפיקסל", "לבדוק את הפיקסל"],
    ]) {
      assertEquals(
        sanitizePulseWordingLine(text, allowed),
        { ok: true, text: expected },
        text,
      );
    }
  });
});
