import { assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { callerProfile, userAddressLine } from "./user-address.ts";

describe("userAddressLine", () => {
  it("addresses a man in the masculine", () => {
    const line = userAddressLine("דוד קסטלנואובו", "male");
    assertMatch(line, /את מדברת עם דוד קסטלנואובו/);
    assertMatch(line, /בלשון זכר/);
    assertNotMatch(line, /בלשון נקבה \(/);
  });

  it("addresses a woman in the feminine", () => {
    assertMatch(userAddressLine("דנה", "female"), /פני אליה בלשון נקבה/);
  });

  it("uses the plural, not a guess from the name, when the gender is unknown", () => {
    const line = userAddressLine("דוד", null);
    assertMatch(line, /בלשון רבים או ניטרלית/);
    assertMatch(line, /לא לנחש מהשם/);
    assertNotMatch(line, /פני אלי(ו|ה) בלשון/);
  });

  it("still sets the rule when the name is unknown", () => {
    const line = userAddressLine("   ", null);
    assertNotMatch(line, /את מדברת עם/);
    assertMatch(line, /בלשון רבים/);
  });

  it("says the feminine instructions are for Carmen, not the user", () => {
    assertMatch(userAddressLine(null, "male"), /מופנות אלייך, כרמן/);
  });
});

/** A client whose profile read answers `answer`. */
function db(answer: { data: unknown; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq"]) {
    chain[name] = () => chain;
  }
  chain.maybeSingle = async () => answer;
  // A fake of the one chain callerProfile walks, not a whole client.
  return { from: () => chain } as unknown as Parameters<
    typeof callerProfile
  >[0];
}

describe("callerProfile", () => {
  it("reads the name and gender from the profile", async () => {
    const profile = db({
      data: { full_name: "דוד", gender: "male" },
      error: null,
    });
    assertEquals(await callerProfile(profile, "u1"), {
      fullName: "דוד",
      gender: "male",
    });
  });

  it("is unknown without a user or when the lookup fails", async () => {
    const unknown = { fullName: null, gender: null };
    const failed = db({ data: null, error: { message: "down" } });
    assertEquals(await callerProfile(failed, null), unknown);
    assertEquals(await callerProfile(failed, "u1"), unknown);
  });
});
