import { describe, expect, it } from "vitest";
import { parseFormMappings, rawFormMappings } from "./facebookFormMappings";

describe("facebook form mappings", () => {
  const settings = {
    page_id: "p1",
    form_mappings: {
      f1: {
        field_mappings: { email: "email", bad: 3 },
        agency_id: "a1",
        sales_person_ids: ["s1", 2],
        tag_id: null,
        form_name: "Form",
        extra: true,
      },
      f2: "broken",
    },
  };

  it("parses object mappings and skips malformed entries", () => {
    const parsed = parseFormMappings(settings);
    expect(Object.keys(parsed)).toEqual(["f1"]);
    expect(parsed.f1).toMatchObject({
      field_mappings: { email: "email" },
      agency_id: "a1",
      client_id: null,
      sales_person_id: null,
      sales_person_ids: ["s1"],
      tag_id: null,
      form_name: "Form",
    });
  });

  it("returns a copy of the raw mappings for writes", () => {
    const raw = rawFormMappings(settings);
    expect(raw).toEqual(settings.form_mappings);
    expect(raw).not.toBe(settings.form_mappings);
    expect(rawFormMappings(null)).toEqual({});
  });
});
