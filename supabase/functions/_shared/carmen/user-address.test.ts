import { assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { callerAddressLine, userAddressLine } from "./user-address.ts";

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

/** A client whose profile read answers `answer`: the one chain callerAddressLine walks, typed by its rows. */
function db(answer: {
  data: { full_name: string | null; gender: string | null } | null;
  error: { message: string } | null;
}) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve(answer),
  };
  return { from: () => query };
}

describe("callerAddressLine", () => {
  it("uses the profile's name and gender", async () => {
    const profile = db({
      data: { full_name: "דוד", gender: "male" },
      error: null,
    });
    const line = await callerAddressLine(profile, "u1", null);
    assertMatch(line, /את מדברת עם דוד\./);
    assertMatch(line, /בלשון זכר/);
  });

  it("prefers the profile name over a request name such as a department label", async () => {
    const profile = db({
      data: { full_name: "דוד", gender: "male" },
      error: null,
    });
    const line = await callerAddressLine(profile, "u1", "מחלקת קופי");
    assertMatch(line, /את מדברת עם דוד\./);
    assertNotMatch(line, /מחלקת קופי/);
  });

  it("falls back to the request name, in the plural, without a profile", async () => {
    const missing = db({ data: null, error: null });
    const line = await callerAddressLine(missing, "u1", "מחלקת קופי");
    assertMatch(line, /את מדברת עם מחלקת קופי\./);
    assertMatch(line, /בלשון רבים/);
  });

  it("is plural without a user or when the lookup fails", async () => {
    const failed = db({ data: null, error: { message: "down" } });
    assertEquals(
      await callerAddressLine(failed, null, null),
      userAddressLine(null, null),
    );
    assertEquals(
      await callerAddressLine(failed, "u1", null),
      userAddressLine(null, null),
    );
  });
});
