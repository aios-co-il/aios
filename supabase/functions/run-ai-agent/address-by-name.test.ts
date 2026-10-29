import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { addressByNameLine } from "./address-by-name.ts";

describe("addressByNameLine", () => {
  it("names the user and asks for the gender their first name shows", () => {
    const line = addressByNameLine("דוד קסטלנואובו") ?? "";
    assertMatch(line, /את מדברת עם דוד קסטלנואובו/);
    assertMatch(line, /לשון זכר לשם של גבר, לשון נקבה לשם של אישה/);
    assertMatch(line, /בלשון רבים/);
  });

  it("adds nothing when the name is unknown", () => {
    assertStrictEquals(addressByNameLine(null), null);
    assertStrictEquals(addressByNameLine("   "), null);
  });
});
