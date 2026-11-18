import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { parseLandingBlocks } from "./page-content.ts";
import { landingCopyText } from "./page-text.ts";

const form = {
  buttonLabel: "לתיאום שיחה",
  successMessage: "תודה, נחזור אליכם",
};
const page = [
  { type: "hero", heading: "כותרת", subheading: "משנה", form },
  { type: "features", items: [{ title: "יתרון", body: "פירוט" }] },
  { type: "faq", items: [{ question: "שאלה?", answer: "תשובה" }] },
  { type: "leadForm", heading: "השאירו פרטים", form },
];

Deno.test("parseLandingBlocks", async (t) => {
  await t.step(
    "accepts a page that opens with a hero and ends with a lead form",
    () => {
      const { blocks, problems } = parseLandingBlocks(page);
      assertEquals(problems, []);
      assertEquals(blocks.length, 4);
      assertEquals(blocks[1], {
        type: "features",
        items: [{ title: "יתרון", body: "פירוט" }],
      });
    },
  );

  await t.step(
    "names a missing lead form and a page that does not open with a hero",
    () => {
      const { problems } = parseLandingBlocks([page[1], page[0]]);
      assertEquals(problems, [
        "המקטע הראשון חייב להיות hero",
        "צריך מקטע leadForm אחד בדיוק, בסוף העמוד",
      ]);
    },
  );

  await t.step(
    "names the section and field that is missing, too long or unknown",
    () => {
      const { problems } = parseLandingBlocks([
        { type: "hero", heading: "", form },
        { type: "myths", items: [{ myth: "x".repeat(201), answer: "כן" }] },
        { type: "gallery" },
        page[3],
      ]);
      assertEquals(problems.slice(0, 2), [
        "מקטע 1: חסר heading",
        "מקטע 2.items.1: myth ארוך מ-200 תווים",
      ]);
      assertStringIncludes(problems[2], 'מקטע 3: סוג לא מוכר "gallery"');
    },
  );

  await t.step("an empty or missing list is refused", () => {
    assertEquals(parseLandingBlocks(undefined).problems[0], "blocks ריק");
  });
});

Deno.test(
  "landingCopyText shows every section with its form and buttons",
  () => {
    const text = landingCopyText(parseLandingBlocks(page).blocks);
    assertStringIncludes(text, "כותרת\nמשנה\n[טופס: שם וטלפון · לתיאום שיחה]");
    assertStringIncludes(text, "• יתרון: פירוט");
    assertStringIncludes(text, "ש: שאלה?\nת: תשובה");
    assertStringIncludes(text, "אחרי שליחה: תודה, נחזור אליכם");
  },
);
