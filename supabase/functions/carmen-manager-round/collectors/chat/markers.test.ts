import { assertEquals } from "jsr:@std/assert@1";
import { onlyAcknowledgements, readMarkers } from "./markers.ts";

Deno.test("readMarkers", async (t) => {
  await t.step("questions and request verbs are requests", () => {
    for (const text of [
      "אפשר להעלות את המבצע החדש?",
      "מתי עולה הקמפיין",
      "תעדכנו אותי לגבי הבאנר",
      "צריך לשנות את התקציב",
      "בסדר?",
    ]) {
      assertEquals(readMarkers([text]).request, true, text);
    }
  });

  await t.step("thanks, acknowledgements and emoji owe no answer", () => {
    for (const text of ["תודה רבה!", "סבבה 👍", "👍🙏", "אוקיי, קיבלתי", ""]) {
      assertEquals(readMarkers([text]), { request: false, complaint: false });
    }
  });

  await t.step("complaints use the shared complaint words", () => {
    assertEquals(readMarkers(["תודה", "אני לא מרוצה מהלידים"]), {
      request: false,
      complaint: true,
    });
  });
});

Deno.test("onlyAcknowledgements", async (t) => {
  await t.step("thanks and emoji only; anything else says more", () => {
    assertEquals(onlyAcknowledgements(["תודה רבה!", "👍🙏"]), true);
    assertEquals(onlyAcknowledgements(["תודה", "הלידים שלכם זבל"]), false);
  });
});
