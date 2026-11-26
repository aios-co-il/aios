import { assertEquals } from "jsr:@std/assert@1";
import { miniMeRenderFile, resolveMiniMeGender } from "./minime-gender.ts";

Deno.test(
  "the user's choice wins, then their address gender, then male",
  () => {
    assertEquals(resolveMiniMeGender("male", "female"), "male");
    assertEquals(resolveMiniMeGender(null, "female"), "female");
    assertEquals(resolveMiniMeGender(null, null), "male");
    assertEquals(resolveMiniMeGender("other", "male"), "male");
  },
);

Deno.test("a render file is named by its skin and its set", () => {
  assertEquals(miniMeRenderFile("cfo", "female"), "cfo-female.webp");
});
