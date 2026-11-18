import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { inferKind, planProject } from "../defaults.ts";
import { workshopRole } from "../roles.ts";
import {
  COPY_CHOICE,
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
    assertEquals(inferKind("דף נחיתה עם סרטון לקליניקה"), "landing");
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

Deno.test("landingTurnLines names the next step at every stage", () => {
  /** The line that names the next step for a project in the given state. */
  function next(state: Record<string, unknown>) {
    return landingTurnLines(landing(state))[1];
  }
  assertStringIncludes(next({}), "השלב הבא: קופי העמוד");
  assertStringIncludes(next({ blocks }), "הקופי נשמר ועוד לא אושר");
  assertStringIncludes(
    next({ blocks, copy_approved: true }),
    "workshop_save_landing_style",
  );
  assertStringIncludes(
    next({ blocks, copy_approved: true, style }),
    "הסגנון נשמר ועוד לא אושר",
  );
  assertStringIncludes(
    next({ blocks, copy_approved: true, style, style_approved: true }),
    "מוכן לבנייה",
  );
});
