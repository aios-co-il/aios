import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { withScript } from "./film-script.ts";
import { scriptLines } from "./script-lines.ts";

const beats = [
  { start_s: 0, end_s: 3, narration: "שלום", on_screen: "", visual: "" },
];
const withConcept = (concept: string) => ({
  project_type: "video",
  workshop_brief: { answers: { קונספט: concept } },
});
const waiting = withScript(withConcept("יום אחד"), {
  artifact_id: "s",
  title: "",
  total_s: 3,
  beats,
  saved_turn: null,
});

Deno.test("the turn note says where the script stands", () => {
  assertMatch(scriptLines(withConcept("יום אחד"), 0)[0], /עוד אין/);
  assertMatch(scriptLines(waiting, 0)[0], /ממתין לאישור/);
  assertEquals(scriptLines(waiting, 2), []);
  assertEquals(
    scriptLines({ ...waiting, workshop_script: { skipped: true } }, 0),
    [],
  );
});

Deno.test(
  "a script the user edited on the board waits for their approval and is not rewritten",
  () => {
    // workshop_edit_page clears the approval and marks the script as the user's edit.
    const edited = {
      ...waiting,
      workshop_script: { ...waiting.workshop_script, edited_by_user: true },
    };
    const [line] = scriptLines(edited, 0);
    assertMatch(line, /ממתין לאישור/);
    assertMatch(line, /ערך אותו בעצמו בלוח/);
  },
);
