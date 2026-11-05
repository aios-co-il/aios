import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { withBriefAnswers } from "./brief-answers.ts";
import {
  BRIEF_ADDED_HEADING,
  MAX_BRIEF,
  projectBrief,
  syncBriefPage,
} from "./project-brief.ts";

const REQUEST = "סרטון לכרמן שמציג את הסקינים שלה";

const withAnswers = (answers: Record<string, string>) => ({
  brief_text: REQUEST,
  workshop_brief: { asked: true, answers },
});

Deno.test("a brief with no answers is the user's request as written", () => {
  assertStrictEquals(projectBrief({ brief_text: ` ${REQUEST} ` }), REQUEST);
  assertStrictEquals(projectBrief({}), "");
});

Deno.test(
  "the request comes first, then one line per answer in the order asked",
  () => {
    assertStrictEquals(
      projectBrief(withAnswers({ קצב: "מהיר", פונט: "Heebo, טקסט גדול" })),
      `${REQUEST}\n\n${BRIEF_ADDED_HEADING}\nקצב: מהיר\nפונט: Heebo, טקסט גדול`,
    );
  },
);

Deno.test(
  "an answer to the same question under another name replaces the old one, last",
  () => {
    const first = withBriefAnswers(
      { brief_text: REQUEST },
      { סיום: "לוגו בלבד", קצב: "רגוע" },
    );
    const corrected = withBriefAnswers(first, {
      "קריאה לפעולה": "לוגו וקריאה לפעולה",
    });
    assertStrictEquals(
      projectBrief(corrected),
      `${REQUEST}\n\n${BRIEF_ADDED_HEADING}\nקצב: רגוע\nקריאה לפעולה: לוגו וקריאה לפעולה`,
    );
    // Answers stored twice by older code show once, the later one.
    assertStrictEquals(
      projectBrief(withAnswers({ סגיר: "בלי סגיר", סיום: "לוגו בלבד" })),
      `${REQUEST}\n\n${BRIEF_ADDED_HEADING}\nסיום: לוגו בלבד`,
    );
  },
);

Deno.test("the whole brief stays within its cap and keeps the request", () => {
  const answers = Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [
      `נושא ${index}`,
      "א".repeat(200),
    ]),
  );
  const long = { ...withAnswers(answers), brief_text: "ב".repeat(5000) };
  const brief = projectBrief(long);
  assert(brief.length <= MAX_BRIEF);
  assert(brief.startsWith("ב".repeat(2000)));
  assert(brief.includes(`${BRIEF_ADDED_HEADING}\nנושא 0: `));
});

interface Page {
  id: string;
  meta: Record<string, unknown>;
}

/** Records the brief page reads and writes. */
function pageDb(pages: Array<Page>) {
  const updates: Array<Pick<Page, "meta">> = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    update(value: { meta: Record<string, unknown> }) {
      updates.push(value);
      return builder;
    },
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: pages, error: null }),
  };
  return { updates, from: () => builder };
}

Deno.test(
  "the board's brief page is rewritten when the brief changes, keeping its summary",
  async () => {
    const db = pageDb([
      { id: "page-1", meta: { summary: "סרט 9:16", brief: REQUEST } },
    ]);
    const after = withAnswers({ קצב: "מהיר" });
    await syncBriefPage(
      db,
      "tenant-1",
      "item-1",
      { brief_text: REQUEST },
      after,
    );
    assertEquals(db.updates, [
      { meta: { summary: "סרט 9:16", brief: projectBrief(after) } },
    ]);

    const unchanged = pageDb([{ id: "page-1", meta: {} }]);
    await syncBriefPage(unchanged, "tenant-1", "item-1", after, after);
    assertEquals(unchanged.updates, []);
  },
);

Deno.test("a tapped yes-or-no question stays out of the brief", () => {
  const brief = projectBrief({
    brief_text: "סרטון למבצע",
    workshop_brief: {
      answers: {
        "לאשר תקציב של $6 לפרויקט?": "מאשר תקציב $6 · 0DBB",
        "סטוריבורד חדש במקום הקיים?": "כן",
        אישור: "מאשר",
        "גרסה קצרה": "לא",
        קצב: "מהיר",
      },
    },
  });
  assertEquals(brief, "סרטון למבצע\n\nפרטים שנוספו לבריף:\nקצב: מהיר");
});
