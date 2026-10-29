import { assertEquals } from "jsr:@std/assert@1";
import { extraPhoneName, memberName, ownerName } from "./names.ts";

Deno.test("report recipient names", async (t) => {
  await t.step("a card or row name wins, trimmed", () => {
    assertEquals(memberName({ full_name: " Felix " }), "Felix");
    assertEquals(ownerName({ full_name: "David" }), "David");
    assertEquals(extraPhoneName(" Office "), "Office");
  });

  await t.step("a missing or blank name falls back to the generic one", () => {
    assertEquals(memberName(undefined), "חבר צוות");
    assertEquals(memberName({ full_name: "  " }), "חבר צוות");
    assertEquals(ownerName({ full_name: null }), "בעלים");
    assertEquals(extraPhoneName(null), "מספר נוסף");
  });
});
