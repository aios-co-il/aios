import { assertEquals } from "jsr:@std/assert@1";
import { hasSeoIntent, isSeoReadTool } from "./seo-read-tools.ts";

Deno.test("isSeoReadTool knows only the SEO read tools", () => {
  assertEquals(isSeoReadTool("get_seo_overview"), true);
  assertEquals(isSeoReadTool("get_client_info"), false);
});

Deno.test(
  "SEO questions in Hebrew and English are recognised; unrelated ones are not",
  () => {
    for (const text of [
      "איך הלקוח שיפוצי אבי בקידום אורגני?",
      "מה המצב ב-SEO של רינת?",
      "תביאי נתוני search console",
      "כמה בקלינקים יש לו באהרפס",
      "האם ChatGPT ממליץ עליו?",
    ]) {
      assertEquals(hasSeoIntent(text), true, text);
    }
    for (const text of ["תפתחי משימה לאנה", "מה הדופק של הקמפיינים היום?"]) {
      assertEquals(hasSeoIntent(text), false, text);
    }
  },
);
