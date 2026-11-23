import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { inferKind, planProject } from "../defaults.ts";
import { workshopRole } from "../roles.ts";
import {
  COPY_CHOICE,
  PUBLISH_CHOICE,
  STYLE_CHOICE,
  asksForLanding,
  landingStateOf,
  landingTurnLines,
  withLandingApprovals,
} from "./project.ts";

const blocks = [{ type: "text" as const, body: "טקסט" }];
const style = {
  primaryColor: "#112233",
  hero: "dark" as const,
  direction: "נקי",
};
/** The payload of a landing page project in the given state. */
function landing(state: Record<string, unknown>) {
  return { project_type: "landing", landing: state };
}

Deno.test(
  "a landing page request is recognised and planned as its own kind",
  () => {
    assertEquals(asksForLanding("פרויקט בניית אתרים חדש: לקליניקה"), true);
    assertEquals(asksForLanding("עמוד הנחיתה של הקמפיין"), true);
    assertEquals(asksForLanding("מודעה לפייסבוק"), false);
    // The next line of a brief is another subject, not what the page describes.
    assertEquals(
      asksForLanding("Create a landing page\nVideo testimonials\nContact form"),
      true,
    );
    assertEquals(asksForLanding("Create a landing page promo video"), false);
    // A page named first as context does not hide the one asked for later.
    assertEquals(
      asksForLanding(
        "For our landing page migration, build a new landing page for the clinic",
      ),
      true,
    );
    assertEquals(
      asksForLanding("Create a banner linking to a landing page"),
      false,
    );
    assertEquals(inferKind("דף נחיתה עם סרטון לקליניקה"), "landing");
    // The first thing named is the deliverable: a film that promotes a landing page is a film.
    assertEquals(inferKind("צרי סרטון לקידום עמוד נחיתה"), "video");
    assertEquals(inferKind("צרי עמוד נחיתה עם סרטון"), "landing");
    // A page that another deliverable promotes or describes is not the deliverable either.
    assertEquals(inferKind("צרי מודעה לקידום עמוד נחיתה"), "static");
    assertEquals(inferKind("Create a landing page promo video"), "video");
    assertEquals(inferKind("Create a landing page with a video"), "landing");
    const plan = planProject({ brief: "עמוד נחיתה לקליניקה" });
    assertEquals(plan.projectType, "landing");
    assertEquals(plan.film, null);
    assertStringIncludes(plan.summary, "עמוד נחיתה");
  },
);

Deno.test(
  "a landing page goes to the copywriter, whatever the message says",
  () => {
    assertEquals(workshopRole("תבני לי עמוד נחיתה", null), "copywriter");
    const open = { video: false, edit: false, landing: true };
    assertEquals(
      workshopRole("תוסיפי תמונה יפה", "creative_direct", open),
      "copywriter",
    );
    assertEquals(workshopRole("מודעה לפייסבוק", null), "designer");
    assertEquals(workshopRole("צרי עמוד נחיתה עם סרטון", null), "copywriter");
    assertEquals(workshopRole("צרי סרטון לקידום עמוד נחיתה", null), "producer");
    // "קליפ" is a film word to project planning only; which film role it gets is roles.ts's own
    // vocabulary, but it is no longer the copywriter's landing page.
    assertNotEquals(
      workshopRole("צרי קליפ לקידום עמוד נחיתה", null),
      "copywriter",
    );
    assertEquals(workshopRole("צרי מודעה לקידום עמוד נחיתה", null), "designer");
    assertEquals(workshopRole("עמוד נחיתה עם סרטון", null), "copywriter");
  },
);

Deno.test("withLandingApprovals", async (t) => {
  await t.step("a tap on the copy question approves the saved copy", () => {
    const result = withLandingApprovals(landing({ blocks }), {
      lastAssistant: `הנה העמוד\n${COPY_CHOICE}`,
      userText: "הקופי מאושר",
    });
    assertEquals(result.changed, true);
    assertEquals(landingStateOf(result.payload).copy_approved, true);
  });

  await t.step(
    "a change request, or an approval nobody asked for, approves nothing",
    () => {
      const fix = withLandingApprovals(landing({ blocks }), {
        lastAssistant: `הנה העמוד\n${COPY_CHOICE}`,
        userText: "לתקן",
      });
      assertEquals(fix.changed, false);
      const unasked = withLandingApprovals(landing({ blocks }), {
        lastAssistant: "מה שלומך?",
        userText: "מאושר",
      });
      assertEquals(unasked.changed, false);
    },
  );

  await t.step(
    "the style is approved by its own question, and only once it exists",
    () => {
      const turn = { lastAssistant: STYLE_CHOICE, userText: "הסגנון מאושר" };
      const none = withLandingApprovals(
        landing({ blocks, copy_approved: true }),
        turn,
      );
      assertEquals(none.changed, false);
      const saved = withLandingApprovals(
        landing({ blocks, copy_approved: true, style }),
        turn,
      );
      assertEquals(landingStateOf(saved.payload).style_approved, true);
    },
  );
});

Deno.test(
  "publishing is approved for the build whose preview was shown",
  () => {
    const turn = {
      lastAssistant: `העמוד נבנה (גרסה d1d1d1d1).\n${PUBLISH_CHOICE}`,
      userText: "לפרסם את העמוד",
    };
    const done = { blocks, copy_approved: true, style, style_approved: true };
    const build = { branch: "b", commit: "c", digest: "d1d1d1d1d1" };
    // No preview yet: there is nothing the user could have seen.
    assertEquals(
      withLandingApprovals(landing({ ...done, build }), turn).changed,
      false,
    );
    const shown = { ...build, preview_url: "https://preview.example/x" };
    const approved = withLandingApprovals(
      landing({ ...done, build: shown }),
      turn,
    );
    assertEquals(
      landingStateOf(approved.payload).publish_approved,
      "d1d1d1d1d1",
    );
    // The question was asked about another build: the project was rebuilt since.
    const rebuilt = { ...shown, digest: "e2e2e2e2e2" };
    assertEquals(
      withLandingApprovals(landing({ ...done, build: rebuilt }), turn).changed,
      false,
    );
    // "Not yet" approves nothing.
    assertEquals(
      withLandingApprovals(landing({ ...done, build: shown }), {
        ...turn,
        userText: "עוד לא",
      }).changed,
      false,
    );
  },
);

Deno.test(
  "every turn tells Carmen where a feature beyond the sections goes",
  () => {
    assertStringIncludes(
      landingTurnLines(landing({}))[0],
      "aios-co-il/landing-pages",
    );
  },
);

Deno.test("landingTurnLines names the next step at every stage", () => {
  /** The line that names the next step for a project in the given state. */
  function next(state: Record<string, unknown>) {
    return landingTurnLines(landing(state))[1];
  }
  assertStringIncludes(next({}), "השלב הבא: קופי העמוד");
  assertStringIncludes(next({ blocks }), "הקופי נשמר ועוד לא אושר");
  // The saved text travels with the step that waits for approval: a new conversation has no other
  // copy of it to show.
  assertStringIncludes(landingTurnLines(landing({ blocks }))[2], "טקסט");
  const styleNote = landingTurnLines(
    landing({ blocks, copy_approved: true, style }),
  )[2];
  assertStringIncludes(styleNote, "נקי");
  assertStringIncludes(styleNote, "#112233");
  assertStringIncludes(
    next({ blocks, copy_approved: true }),
    "workshop_save_landing_style",
  );
  assertStringIncludes(
    next({ blocks, copy_approved: true, style }),
    "הסגנון נשמר ועוד לא אושר",
  );
  const done = { blocks, copy_approved: true, style, style_approved: true };
  const build = { branch: "b", commit: "c", digest: "d1" };
  const shown = { ...build, preview_url: "https://preview.example/x" };
  assertStringIncludes(next(done), "workshop_build_landing_page");
  assertStringIncludes(next({ ...done, build }), "עוד עולה");
  assertStringIncludes(next({ ...done, build: shown }), PUBLISH_CHOICE);
  assertStringIncludes(
    next({ ...done, build: shown, publish_approved: "d1" }),
    "workshop_publish_landing_page",
  );
  // An approval given to an earlier build does not publish a newer one.
  assertStringIncludes(
    next({ ...done, build: shown, publish_approved: "d0" }),
    PUBLISH_CHOICE,
  );
});
