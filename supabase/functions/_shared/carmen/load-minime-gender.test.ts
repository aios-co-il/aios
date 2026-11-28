import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { fakeSupabase } from "../testing/fake-supabase.ts";
import { withConsoleErrors } from "../testing/console-errors.ts";
import { loadMiniMeGender } from "./load-minime-gender.ts";

/** A database holding one user's profile. */
function dbWithProfile(profile: Record<string, unknown>) {
  return fakeSupabase({ profiles: [{ id: "user-1", ...profile }] });
}

describe("loadMiniMeGender", () => {
  it("follows the site's rule", async () => {
    const chose = dbWithProfile({ minime_gender: "female", gender: "male" });
    const addressed = dbWithProfile({ minime_gender: null, gender: "female" });
    const unknown = dbWithProfile({ minime_gender: null, gender: null });

    assertEquals(await loadMiniMeGender(chose, "user-1"), "female");
    assertEquals(await loadMiniMeGender(addressed, "user-1"), "female");
    assertEquals(await loadMiniMeGender(unknown, "user-1"), "male");
    assertEquals(await loadMiniMeGender(unknown, "nobody"), "male");
    assertEquals(await loadMiniMeGender(unknown, null), "male");
  });

  it("is male when the profile cannot be read, and logs why", async () => {
    const failing = fakeSupabase({}, { failing: { profiles: "down" } });

    const { result, logged } = await withConsoleErrors(() =>
      loadMiniMeGender(failing, "user-1"),
    );

    assertEquals(result, "male");
    assertStringIncludes(logged, "[minime-gender] profile lookup failed");
  });
});
