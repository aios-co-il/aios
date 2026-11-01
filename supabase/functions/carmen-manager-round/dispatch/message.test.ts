import { assertEquals } from "jsr:@std/assert@1";
import { composeAlertMessage, firstName } from "./message.ts";

Deno.test("composeAlertMessage", async (t) => {
  await t.step("one item, by first name", () => {
    assertEquals(
      composeAlertMessage("דנה כהן", [
        {
          short_code: 231,
          summary_he: "לקוח א: אין קשר 14 יום",
          escalated: false,
          critical: false,
        },
      ]),
      "היי דנה, יש דבר אחד שדורש טיפול:\n1) #231 לקוח א: אין קשר 14 יום",
    );
  });

  await t.step("several items mark escalations and urgent ones", () => {
    const text = composeAlertMessage("", [
      { short_code: 7, summary_he: "א", escalated: true, critical: false },
      { short_code: 8, summary_he: "ב", escalated: false, critical: true },
    ]);
    assertEquals(
      text,
      "היי, יש 2 דברים שדורשים טיפול:\n1) #7 א (עבר אליך כי לא טופל בזמן)\n2) #8 ב (דחוף)",
    );
  });

  await t.step("firstName", () => {
    assertEquals([firstName("  רונית  לוי "), firstName("")], ["רונית", ""]);
  });
});
