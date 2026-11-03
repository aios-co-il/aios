import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { stillsMessage } from "./make-stills-message.ts";

const outcome = {
  created: 2,
  failed: [],
  ownMade: 0,
  references: 1,
  remaining: 0,
  note: "שאלי על התמונות.",
};

describe("stillsMessage", () => {
  it("says nothing was made, with the first error", () => {
    assertStrictEquals(
      stillsMessage({ ...outcome, created: 0, failed: [{ error: "quota" }] }),
      "לא נוצרה אף תמונה. quota",
    );
  });

  it("names the references and ends with the approval note on the last picture", () => {
    const message = stillsMessage(outcome);
    assertMatch(message, /^2 תמונות נוצרו/);
    assertMatch(message, /נוצרו לפי 1 רפרנסים/);
    assertMatch(message, /שאלי על התמונות\.$/);
  });

  it("asks for a reference when the project has none, and to call again while scenes remain", () => {
    const message = stillsMessage({ ...outcome, references: 0, remaining: 3 });
    assertMatch(message, /אין לפרויקט רפרנס/);
    assertMatch(message, /נשארו 3 סצנות בלי תמונה/);
    assertNotMatch(message, /שאלי על התמונות/);
  });

  it("says which pictures followed their scene's own picture", () => {
    const message = stillsMessage({ ...outcome, ownMade: 2 });
    assertMatch(message, /2 מהן נוצרו לפי התמונה של הסצנה עצמה/);
    assertNotMatch(message, /רפרנס/);
  });
});
