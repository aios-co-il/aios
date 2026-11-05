import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { readRequest, referenceThisTurn } from "./brief-reading.ts";

Deno.test("an attached image is a picture reference, named by its file", () => {
  const link = `https://files.example.com/ad.png?token=${"x".repeat(300)}`;
  const reference = referenceThisTurn(
    {},
    `כמו זה\n\n📎 קבצים מצורפים (1):\n- תמונה: ad.png → ${link}`,
  );
  assertEquals(reference, { answer: "תמונה שצורפה: ad.png", picture: link });
});

Deno.test(
  "a video link names a reference but is not a picture to follow",
  () => {
    assertEquals(
      referenceThisTurn({}, "בסגנון https://cdn.example.com/a.mp4"),
      {
        answer: "https://cdn.example.com/a.mp4",
        picture: null,
      },
    );
  },
);

Deno.test("a board picture is named for the user, not by its id", () => {
  assertEquals(referenceThisTurn({ from_artifact_id: "art-1" }, ""), {
    answer: "תמונה מהלוח",
    picture: null,
  });
});

Deno.test("a site link or plain text is no reference", () => {
  assertStrictEquals(
    referenceThisTurn({}, "סרטון לעסק https://shop.example.com"),
    null,
  );
  assertStrictEquals(referenceThisTurn({}, "סרטון מושן גרפיקס"), null);
});

Deno.test(
  "the request counts as read only once the gate asked in this turn",
  () => {
    const deps = { turnId: "turn-2" };
    const readLastTurn = { workshop_brief: { read_turn: "turn-1" } };
    assertStrictEquals(readRequest(readLastTurn, {}, deps, true), false);
    assertStrictEquals(
      readRequest({ workshop_brief: { read_turn: "turn-2" } }, {}, deps, true),
      true,
    );
    // Answers Carmen sends on her own (a tapped concept, the ending) are not a reading of the
    // request (Staging, 4 Nov: the look the request named was asked again).
    assertStrictEquals(
      readRequest(
        readLastTurn,
        { brief_answers: { קונספט: "תחלופה" } },
        deps,
        true,
      ),
      false,
    );
    // A tool that cannot keep the mark never asks, so it cannot loop.
    assertStrictEquals(readRequest(readLastTurn, {}, deps, false), true);
  },
);
