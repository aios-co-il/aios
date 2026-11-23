import { assertEquals } from "jsr:@std/assert@1";
import { isLeadNotice } from "./lead-notice.ts";

Deno.test("isLeadNotice", async (t) => {
  await t.step("an automated lead notification is one", () => {
    assertEquals(
      isLeadNotice(
        "ליד מקמפיין פייסבוק: - עברית\nשם מלא: נועה\nמס' טלפון: 0500000000",
      ),
      true,
    );
    assertEquals(isLeadNotice("ליד חדש מהאתר\nשם מלא: דני"), true);
  });

  await t.step("a person talking about leads is not", () => {
    assertEquals(isLeadNotice("ליד מהקמפיין התקשר אלינו היום"), false);
    assertEquals(isLeadNotice("יש לנו מעט לידים, מה שם מלא: לא ברור"), false);
  });
});
