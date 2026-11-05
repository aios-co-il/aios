import { assertEquals } from "jsr:@std/assert@1";
import { contactDraftOf, parseConfirmDraftReply } from "./contact-draft.ts";

Deno.test("contactDraftOf", async (t) => {
  await t.step("reads a call or meeting draft", () => {
    assertEquals(
      contactDraftOf({
        attributed: true,
        draft: { update_type: "meeting", text_he: " פגישה עם הלקוח " },
      }),
      { update_type: "meeting", text_he: "פגישה עם הלקוח" },
    );
  });

  await t.step("anything else is no draft", () => {
    assertEquals(contactDraftOf(null), null);
    assertEquals(contactDraftOf({ draft: "שיחה" }), null);
    assertEquals(
      contactDraftOf({ draft: { update_type: "note", text_he: "x" } }),
      null,
    );
    assertEquals(
      contactDraftOf({ draft: { update_type: "call", text_he: "  " } }),
      null,
    );
  });
});

Deno.test("parseConfirmDraftReply", async (t) => {
  await t.step("finds the code after the reply word", () => {
    assertEquals(parseConfirmDraftReply("תעדי 123"), 123);
    assertEquals(parseConfirmDraftReply("תעד #45"), 45);
    assertEquals(parseConfirmDraftReply("כרמן, תעדו 7 בבקשה"), 7);
  });

  await t.step("other text is no reply", () => {
    assertEquals(parseConfirmDraftReply("צריך לתעד 123"), null);
    assertEquals(parseConfirmDraftReply("תעדי את השיחה"), null);
    assertEquals(parseConfirmDraftReply("123"), null);
  });
});
