import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import {
  deterministicNumbers,
  hasNumberWord,
  numberTokens,
} from "./wording-numbers.ts";

Deno.test("numberTokens", async (t) => {
  await t.step(
    "numbers are canonical and dates, times and ranges stay whole",
    () => {
      assertEquals(numberTokens("CPL 52.0 מעל 1,200 ו־3,5"), [
        "52",
        "1200",
        "3.5",
      ]);
      assertEquals(numberTokens("שינוי ב־2026-10-20T08:00 ובין 3/7"), [
        "2026-10-20T08:00",
        "3/7",
      ]);
    },
  );

  await t.step("a number before ימים or הימים is a window length", () => {
    assertEquals(numberTokens("3 ימים: 52 · ב־7 הימים · יום 4"), [
      "3 ימים",
      "52",
      "7 ימים",
      "4",
    ]);
  });
});

Deno.test("deterministicNumbers", async (t) => {
  await t.step(
    "evidence values and message window lengths, not trends or names",
    () => {
      const candidate: PulseInstantAlertCandidate = {
        client_id: "c1",
        client_name: "Acme 9",
        rule_type: "campaign_exception",
        message: "קמפיין: Leads 2\n3 ימים: 52 · 7 ימים: 48",
        evidence: {
          target_value: 30,
          efficiency_3d: 52,
          trend_3d_pct: 40,
          data_fresh_through: "2026-10-27",
        },
      };
      assertEquals(
        [...deterministicNumbers(candidate)].sort(),
        ["2026-10-27", "3 ימים", "30", "52", "7 ימים"].sort(),
      );
    },
  );
});

Deno.test("hasNumberWord", async (t) => {
  await t.step(
    "numbers, fractions and multipliers in words are found, prefixed too",
    () => {
      for (const text of [
        "שלושה ימים ברציפות",
        "ובשלושת הימים",
        "עשרות לידים",
        "כמעט כפולה מהיעד",
        "לחצי מהיעד",
        "פי שניים",
        "פי 2 מהיעד",
        "פי3 מהיעד",
        "x3 מהיעד",
        "התקציב הוכפל",
        "יומיים ברציפות",
        "אפס לידים",
        "שני קמפיינים",
        "ששה ימים",
        "חמשה ימים",
        "שלשה ימים",
        "שלש פעמים",
        "שתים עשרה",
        "מאתים שקל",
        "מליון שקל",
        "מליארד",
        "עשירית מהיעד",
        "בפעם השלישית",
        "ליד אחד בלבד",
        "ליד אחד מאז השינוי",
        "ליד אחד הגיע השבוע",
        "מודעה אחת הושהתה",
        "רק ליד אחד מהקמפיין",
        "הליד האחד",
        "יותר מאחד",
        "בדיקה של אחד הקמפיינים",
        "ליד יחיד",
        "ליד בודד",
        "עלייה דו-ספרתית",
        "ירידה חד־ספרתית",
        "חמישת הימים",
        "only one lead",
        "a single lead",
        "only once",
        "a third of the target",
        "a quarter of the target",
        "CPL doubled",
        "twice the target",
        "half the target",
        "thrice",
      ]) {
        assertStrictEquals(hasNumberWord(text), true, text);
      }
    },
  );

  await t.step(
    "the כפל, שלש and רבע roots count in every form and with any prefix",
    () => {
      for (const text of [
        "כפל היעד",
        "לכפל היעד",
        "הכפלת העלות",
        "הכפלה של העלות",
        "העלות מוכפלת",
        "הקמפיינים מוכפלים",
        "כופל את העלות",
        "העלות התכפלה",
        "בכפליים",
        "יכפיל את העלות",
        "העלות שילשה את עצמה",
        "העלות שולשה",
        "העלות שולשו",
        "העלות התשלשה",
        "לשלש את התקציב",
        "משולש מהיעד",
        "העלות מרובעת",
        "העלות ריבעה את עצמה",
        "רבע מהיעד",
      ]) {
        assertStrictEquals(hasNumberWord(text), true, text);
      }
    },
  );

  await t.step("words that only contain a number word pass", () => {
    for (const text of [
      "לפי הנתונים",
      "על פי הנתונים",
      "על־פי הנתונים",
      "כפי שמופיע בהודעה",
      "לבדוק את הפיקסל",
      "מאותו שבוע",
      "מאז יום שלישי",
      "לבדוק את הקהלים ביום שני",
      "הצד השני של המשפך",
      "הקמפיין המשני",
      "העשרת קהלים",
      "אחד הקמפיינים",
      "אחת מהמודעות",
      "לאחד את הקהלים",
      "באחד הקמפיינים יש חריגה",
      "הקמפיין חורג. אחת מהמודעות לא מביאה לידים",
      "מאז יום רביעי",
      "לבדוק את התשלומים בחשבון",
      "העלות לליד גבוהה בערב",
      "CPL max 30",
      "הקמפיין מעל היעד המאושר",
    ]) {
      assertStrictEquals(hasNumberWord(text), false, text);
    }
  });
});
