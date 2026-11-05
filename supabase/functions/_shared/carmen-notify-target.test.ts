import { assertStrictEquals } from "jsr:@std/assert@1";
import { resolveCarmenNotifyTarget } from "./carmen-notify-target.ts";

const PARTNER = "972500000003";

Deno.test("resolveCarmenNotifyTarget with a report list", async (t) => {
  await t.step(
    "a report recipient with no session still gets a private notify, named from the list",
    () => {
      const result = resolveCarmenNotifyTarget({
        reportRecipients: [
          { phone: PARTNER, name: "Partner", source: "configured" },
        ],
        sessions: [],
        staff: [],
      });

      assertStrictEquals(result.source, "report_recipient");
      assertStrictEquals(result.chatId, PARTNER);
      assertStrictEquals(result.contactName, "Partner");
    },
  );

  await t.step("a staff card names the recipient before the list does", () => {
    const result = resolveCarmenNotifyTarget({
      reportRecipients: [
        { phone: PARTNER, name: "Listed name", source: "configured" },
      ],
      sessions: [],
      staff: [{ phone: "0500000003", full_name: "Card name", role: null }],
    });

    assertStrictEquals(result.source, "report_recipient");
    assertStrictEquals(result.contactName, "Card name");
  });
});
