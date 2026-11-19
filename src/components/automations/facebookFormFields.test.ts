import { describe, expect, it } from "vitest";
import { parseFacebookFormFields } from "./facebookFormFields";

describe("parseFacebookFormFields", () => {
  it("reads key, label and type as text and skips non-objects", () => {
    expect(
      parseFacebookFormFields([
        { key: "phone_number", label: "Phone", type: "PHONE" },
        { key: 7 },
        "junk",
      ]),
    ).toEqual([
      { key: "phone_number", label: "Phone", type: "PHONE" },
      { key: "7", label: undefined, type: undefined },
    ]);
  });

  it("returns undefined when the setting is not a list", () => {
    expect(parseFacebookFormFields(undefined)).toBeUndefined();
    expect(parseFacebookFormFields({ key: "x" })).toBeUndefined();
  });
});

it("drops entries without a real field key", () => {
  expect(
    parseFacebookFormFields([
      { label: "missing" },
      { key: 7, label: "number" },
    ]),
  ).toEqual([{ key: "7", label: "number" }]);
});
