import { assertEquals } from "jsr:@std/assert@1";

import { briefSourceFor } from "./brief-source.ts";

Deno.test("briefSourceFor", async (t) => {
  await t.step("labels manual uploads apart from extension recordings", () => {
    assertEquals(briefSourceFor("manual"), "manual_upload");
    assertEquals(briefSourceFor("chrome_extension"), "chrome_extension");
    assertEquals(briefSourceFor(null), "chrome_extension");
  });
});
