import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { groupMessageInvokesCarmen } from "./carmen.ts";

test("requires Carmen in every group message", () => {
  assert.equal(groupMessageInvokesCarmen("קארמן, תבדקי את הדוח"), true);
  assert.equal(groupMessageInvokesCarmen("כרמן מה מצב הקמפיין?"), true);
  assert.equal(groupMessageInvokesCarmen("קרמן תעני בבקשה"), true);
  assert.equal(groupMessageInvokesCarmen("מה מצב הקמפיין?"), false);
});

test("does not accept a partial-word match", () => {
  assert.equal(groupMessageInvokesCarmen("הכרמנית החדשה נראית טוב"), false);
  assert.equal(groupMessageInvokesCarmen("דיברנו על הקמפיין"), false);
});

test("accepts voice transcript prefix", () => {
  assert.equal(groupMessageInvokesCarmen("🎤 קארמן מה נשמע?"), true);
});

test("third person / talking ABOUT Carmen does NOT trigger", () => {
  assert.equal(
    groupMessageInvokesCarmen("כרמן אמורה להגיב רק כשמדברים איתה לא עליה"),
    false,
  );
  assert.equal(
    groupMessageInvokesCarmen("כרמן שלחה בדיקת דופק בקבוצה עם דניאל"),
    false,
  );
  assert.equal(groupMessageInvokesCarmen("למה כרמן שלחה את זה עכשיו"), false);
  assert.equal(groupMessageInvokesCarmen("דיברנו על כרמן אתמול בערב"), false);
  assert.equal(groupMessageInvokesCarmen("כרמן צריכה לבדוק את זה מחר"), false);
  assert.equal(
    groupMessageInvokesCarmen("אמרנו שכרמן אמורה לא להגיב סתם"),
    false,
  );
});

test("direct ask / imperative DOES trigger", () => {
  assert.equal(
    groupMessageInvokesCarmen("כרמן תבקשי מקרסר לבדוק את הראוטינג"),
    true,
  );
  assert.equal(groupMessageInvokesCarmen("כרמן תצטרפי"), true);
  assert.equal(groupMessageInvokesCarmen("כרמן, תצטרפי בבקשה"), true);
  assert.equal(groupMessageInvokesCarmen("כרמן תבדקי דופק"), true);
  assert.equal(groupMessageInvokesCarmen("כרמן?"), true);
  assert.equal(groupMessageInvokesCarmen("כרמן"), true);
});

test("meeting join addressed to Carmen still triggers", () => {
  assert.equal(
    groupMessageInvokesCarmen("כרמן תצטרפי https://zoom.us/j/123456789"),
    true,
  );
  assert.equal(
    groupMessageInvokesCarmen("כרמן https://meet.google.com/abc-defg-hij"),
    true,
  );
  // Talking about a meeting without asking her → silent
  assert.equal(
    groupMessageInvokesCarmen("כרמן אמורה להצטרף לשיחה https://zoom.us/j/999"),
    false,
  );
});

test("uncertain mid-sentence mention stays silent", () => {
  assert.equal(
    groupMessageInvokesCarmen("דניאל ואני חיכינו לכרמן עם העדכון"),
    false,
  );
  assert.equal(groupMessageInvokesCarmen("תגיד לכרמן שתשלח דוח"), false);
});

test("Manus group identity reads senderLid and semantically deduplicates retries", () => {
  const webhookSource = readFileSync(
    new URL("../manus-wa-webhook/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    webhookSource,
    /payload\.author,\s*payload\.participant,\s*payload\.senderLid,\s*key\.participant/,
  );
  assert.match(
    webhookSource,
    /authorCandidates\.find\(\(c\) => c\.endsWith\(["']@c\.us["']\)\)/,
  );
  assert.match(webhookSource, /isUnresolvedGroupAuthor/);
  assert.match(webhookSource, /provider:\s*["']carmen_group_turn["']/);
  assert.match(webhookSource, /dedup:\s*["']group_fingerprint["']/);
});

test("greeting before her name addresses Carmen", () => {
  assert.equal(groupMessageInvokesCarmen("היי כרמן, זאת אנה"), true);
  assert.equal(groupMessageInvokesCarmen("בוקר טוב כרמן"), true);
  assert.equal(groupMessageInvokesCarmen("היי, דיברתי עם כרמן אתמול"), false);
  assert.equal(groupMessageInvokesCarmen("היי, כרמן לא ענתה לי אתמול"), false);
});

test("opening with her name and asking her counts", () => {
  assert.equal(
    groupMessageInvokesCarmen(
      "כרמן על כל שאלה את עונה פעמיים או שזה בגלל ששאלתי פעמיים?",
    ),
    true,
  );
  assert.equal(groupMessageInvokesCarmen("כרמן זה נראה לך הגיוני"), true);
  assert.equal(groupMessageInvokesCarmen("כרמן בדוח של אתמול"), false);
});

test("reporting about her with an object marker stays silent", () => {
  assert.equal(groupMessageInvokesCarmen("כרמן בדקה את הדוח של אתמול"), false);
  assert.equal(groupMessageInvokesCarmen("כרמן קיבלה ממך את הקובץ"), false);
  assert.equal(groupMessageInvokesCarmen("כרמן סיימה את הקמפיין?"), false);
});
