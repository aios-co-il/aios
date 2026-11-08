import { assertStringIncludes } from "jsr:@std/assert@1";
import { userAddressLine } from "../_shared/carmen/user-address.ts";
import { sessionInstructions } from "./session-context.ts";

Deno.test("sessionInstructions", async (t) => {
  await t.step(
    "carries the caller's address line for both voice providers",
    () => {
      const text = sessionInstructions(
        { agent: null, pronunciations: [], orgBrief: null },
        userAddressLine("דוד", "male"),
      );
      assertStringIncludes(text, "דוד");
      assertStringIncludes(text, "לשון זכר");
    },
  );

  await t.step("keeps the pronunciations next to it", () => {
    const text = sessionInstructions(
      {
        agent: null,
        pronunciations: [{ term: "כרמן", spoken: "קַרְמֶן" }],
        orgBrief: null,
      },
      userAddressLine(null, null),
    );
    assertStringIncludes(text, "קַרְמֶן");
    assertStringIncludes(text, "לשון רבים");
  });
});
