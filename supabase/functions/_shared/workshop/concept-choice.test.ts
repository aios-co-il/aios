import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  conceptFromMessage,
  conceptPickedByUser,
  withoutUnpickedConcept,
} from "./concept-choice.ts";

const asked = "[[בחירה: קונספט | יום אחד | לילה של כוכבים]]";

describe("conceptPickedByUser", () => {
  it("takes an option of the concept question the user answered", () => {
    assertStrictEquals(
      conceptPickedByUser("לילה של כוכבים", {
        userText: "השני",
        lastAssistant: asked,
      }),
      true,
    );
  });

  it("refuses a concept that was neither offered nor said by the user", () => {
    // Staging, 5 Nov: the user tapped Carmen's own script approval, not a concept.
    assertStrictEquals(
      conceptPickedByUser("שגרה שמתפרקת", {
        userText: "מאשרת, אפשר להמשיך",
        lastAssistant: "[[בחירה: אישור התסריט | מאשרת, אפשר להמשיך | לתקן]]",
      }),
      false,
    );
  });

  it("refuses a title made from one word of the request", () => {
    assertStrictEquals(
      conceptPickedByUser("פסח של חיסכון", {
        userText: "סרטון לפסח עם 20% הנחה",
        lastAssistant: "",
      }),
      false,
    );
  });

  it("takes a concept in the user's own words", () => {
    assertStrictEquals(
      conceptPickedByUser("כלב רץ בפארק", {
        userText: "רוצה סרט שבו הכלב רץ בפארק",
        lastAssistant: "",
      }),
      true,
    );
  });
});

describe("withoutUnpickedConcept", () => {
  it("drops only a concept answer the user did not pick", () => {
    assertEquals(
      withoutUnpickedConcept(
        { קונספט: "שגרה שמתפרקת", קצב: "מהיר" },
        { userText: "מהיר", lastAssistant: "" },
      ),
      { קצב: "מהיר" },
    );
  });
});

describe("conceptFromMessage", () => {
  it("reads the board's approve line, and nothing from other messages", () => {
    assertStrictEquals(conceptFromMessage("קונספט: יום אחד"), "יום אחד");
    assertStrictEquals(conceptFromMessage("תעשי את זה מצחיק"), "");
  });
});
