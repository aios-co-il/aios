import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";
import { groupMessageInvokesCarmen } from "./carmen.ts";

Deno.test("requires Carmen in every group message", () => {
  assertStrictEquals(groupMessageInvokesCarmen("קארמן, תבדקי את הדוח"), true);
  assertStrictEquals(groupMessageInvokesCarmen("כרמן מה מצב הקמפיין?"), true);
  assertStrictEquals(groupMessageInvokesCarmen("קרמן תעני בבקשה"), true);
  assertStrictEquals(groupMessageInvokesCarmen("מה מצב הקמפיין?"), false);
});

Deno.test("does not accept a partial-word match", () => {
  assertStrictEquals(
    groupMessageInvokesCarmen("הכרמנית החדשה נראית טוב"),
    false,
  );
  assertStrictEquals(groupMessageInvokesCarmen("דיברנו על הקמפיין"), false);
});

Deno.test("accepts voice transcript prefix", () => {
  assertStrictEquals(groupMessageInvokesCarmen("🎤 קארמן מה נשמע?"), true);
});

Deno.test("third person / talking ABOUT Carmen does NOT trigger", () => {
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן אמורה להגיב רק כשמדברים איתה לא עליה"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן שלחה בדיקת דופק בקבוצה עם דניאל"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("למה כרמן שלחה את זה עכשיו"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("דיברנו על כרמן אתמול בערב"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן צריכה לבדוק את זה מחר"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("אמרנו שכרמן אמורה לא להגיב סתם"),
    false,
  );
});

Deno.test("direct ask / imperative DOES trigger", () => {
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן תבקשי מקרסר לבדוק את הראוטינג"),
    true,
  );
  assertStrictEquals(groupMessageInvokesCarmen("כרמן תצטרפי"), true);
  assertStrictEquals(groupMessageInvokesCarmen("כרמן, תצטרפי בבקשה"), true);
  assertStrictEquals(groupMessageInvokesCarmen("כרמן תבדקי דופק"), true);
  assertStrictEquals(groupMessageInvokesCarmen("כרמן?"), true);
  assertStrictEquals(groupMessageInvokesCarmen("כרמן"), true);
});

Deno.test("meeting join addressed to Carmen still triggers", () => {
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן תצטרפי https://zoom.us/j/123456789"),
    true,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן https://meet.google.com/abc-defg-hij"),
    true,
  );
  // Talking about a meeting without asking her → silent
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן אמורה להצטרף לשיחה https://zoom.us/j/999"),
    false,
  );
});

Deno.test("uncertain mid-sentence mention stays silent", () => {
  assertStrictEquals(
    groupMessageInvokesCarmen("דניאל ואני חיכינו לכרמן עם העדכון"),
    false,
  );
  assertStrictEquals(groupMessageInvokesCarmen("תגיד לכרמן שתשלח דוח"), false);
});

Deno.test(
  "Manus group identity reads senderLid and semantically deduplicates retries",
  () => {
    const webhookSource = readFileSync(
      new URL("../manus-wa-webhook/index.ts", import.meta.url),
      "utf8",
    );
    assertMatch(
      webhookSource,
      /payload\.author,\s*payload\.participant,\s*payload\.senderLid,\s*key\.participant/,
    );
    assertMatch(
      webhookSource,
      /authorCandidates\.find\(\(c\) => c\.endsWith\(["']@c\.us["']\)\)/,
    );
    assertMatch(webhookSource, /isUnresolvedGroupAuthor/);
    assertMatch(webhookSource, /provider:\s*["']carmen_group_turn["']/);
    assertMatch(webhookSource, /dedup:\s*["']group_fingerprint["']/);
  },
);

Deno.test("greeting before her name addresses Carmen", () => {
  assertStrictEquals(groupMessageInvokesCarmen("היי כרמן, זאת אנה"), true);
  assertStrictEquals(groupMessageInvokesCarmen("בוקר טוב כרמן"), true);
  assertStrictEquals(
    groupMessageInvokesCarmen("היי, דיברתי עם כרמן אתמול"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("היי, כרמן לא ענתה לי אתמול"),
    false,
  );
});

Deno.test("opening with her name and asking her counts", () => {
  assertStrictEquals(
    groupMessageInvokesCarmen(
      "כרמן על כל שאלה את עונה פעמיים או שזה בגלל ששאלתי פעמיים?",
    ),
    true,
  );
  assertStrictEquals(groupMessageInvokesCarmen("כרמן זה נראה לך הגיוני"), true);
  assertStrictEquals(groupMessageInvokesCarmen("כרמן בדוח של אתמול"), false);
});

Deno.test("reporting about her with an object marker stays silent", () => {
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן בדקה את הדוח של אתמול"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן קיבלה ממך את הקובץ"),
    false,
  );
  assertStrictEquals(
    groupMessageInvokesCarmen("כרמן סיימה את הקמפיין?"),
    false,
  );
});
