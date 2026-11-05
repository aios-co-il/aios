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

  it("refuses an option when the user turned down every option", () => {
    assertStrictEquals(
      conceptPickedByUser("יום אחד", {
        userText: "לא אוהבת אף אחד, תכתבי חדשים",
        lastAssistant: asked,
      }),
      false,
    );
  });

  it("refuses an option with words the user never offered added to it", () => {
    assertStrictEquals(
      conceptPickedByUser("יום אחד ועוד טוויסט שהמצאתי", {
        userText: "יום אחד",
        lastAssistant: asked,
      }),
      false,
    );
  });

  it("takes the option the user tapped or named, and only that one", () => {
    const turn = (userText: string) => ({ userText, lastAssistant: asked });
    assertStrictEquals(conceptPickedByUser("יום אחד", turn("יום אחד")), true);
    assertStrictEquals(
      conceptPickedByUser("יום אחד", turn("הולכת על היום אחד")),
      true,
    );
    assertStrictEquals(
      conceptPickedByUser("יום אחד", turn("לא יום אחד, משהו אחר")),
      false,
    );
    assertStrictEquals(conceptPickedByUser("יום אחד", turn("השני")), false);
  });

  it("maps an ordinal to the option in its place", () => {
    const turn = (userText: string) => ({ userText, lastAssistant: asked });
    assertStrictEquals(conceptPickedByUser("יום אחד", turn("הראשון")), true);
    assertStrictEquals(conceptPickedByUser("יום אחד", turn("1")), true);
    assertStrictEquals(
      conceptPickedByUser("לילה של כוכבים", turn("האחרון בבקשה")),
      true,
    );
    assertStrictEquals(
      conceptPickedByUser("יום אחד", turn("לא הראשון, השני")),
      false,
    );
  });

  it("refuses a title echoed from the request, which names no concept", () => {
    // Review of 5 Nov: three of the four words of Carmen's title were in the request.
    assertStrictEquals(
      conceptPickedByUser("פסח של חיסכון", {
        userText: "סרטון לפסח על מבצע חיסכון למשפחות",
        lastAssistant: "",
      }),
      false,
    );
  });

  it("takes a concept the user describes after a concept cue", () => {
    assertStrictEquals(
      conceptPickedByUser("כלב רץ בפארק", {
        userText: "סרטון לפסח. הרעיון: כלב רץ בפארק",
        lastAssistant: "",
      }),
      true,
    );
    // The concept's words come from the part after the cue, not from the request before it.
    assertStrictEquals(
      conceptPickedByUser("פסח של חיסכון", {
        userText: "סרטון לפסח על מבצע חיסכון. הרעיון: משפחה בטיול",
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

  it("drops an offered concept when the user turned the options down", () => {
    assertEquals(
      withoutUnpickedConcept(
        { קונספט: "יום אחד" },
        { userText: "לא אוהבת אף אחד, תכתבי חדשים", lastAssistant: asked },
      ),
      {},
    );
  });
});

describe("conceptFromMessage", () => {
  it("reads the board's approve line, and nothing from other messages", () => {
    assertStrictEquals(conceptFromMessage("קונספט: יום אחד"), "יום אחד");
    assertStrictEquals(conceptFromMessage("תעשי את זה מצחיק"), "");
  });
});
