import { describe, expect, it } from "vitest";

import type { LeadCustomFieldDefinition } from "@/lib/leadCustomFields";
import {
  customFieldEditorKind,
  isEditableLeadField,
  leadCellEditValue,
  leadCellPatch,
  leadCustomCellPatch,
} from "./leadCellValues";

const budgetField: LeadCustomFieldDefinition = {
  id: "f1",
  field_key: "team_size",
  field_label: "גודל צוות",
  field_type: "number",
  is_required: false,
  is_visible: true,
  options: null,
  sort_order: 1,
};

describe("isEditableLeadField", () => {
  it("accepts the columns a cell edits and refuses the rest", () => {
    expect(isEditableLeadField("phone")).toBe(true);
    expect(isEditableLeadField("created_at")).toBe(false);
    expect(isEditableLeadField("products")).toBe(false);
  });
});

describe("leadCellEditValue", () => {
  it("opens an unset value as an empty field", () => {
    expect(leadCellEditValue(null, "text")).toBe("");
  });

  it("opens a timestamp as the date the date field takes", () => {
    expect(leadCellEditValue("2026-03-05T00:00:00+00:00", "date")).toBe(
      "2026-03-05",
    );
  });

  it("opens a number as text", () => {
    expect(leadCellEditValue(1500, "number")).toBe("1500");
  });
});

describe("leadCellPatch", () => {
  it("saves a text value and clears it when emptied", () => {
    expect(leadCellPatch("phone", "050-1234567")).toEqual({
      patch: { phone: "050-1234567" },
    });
    expect(leadCellPatch("phone", "")).toEqual({ patch: { phone: null } });
  });

  it("saves a number as a number", () => {
    expect(leadCellPatch("monthly_budget", "1500")).toEqual({
      patch: { monthly_budget: 1500 },
    });
  });

  it("refuses an empty company name", () => {
    expect(leadCellPatch("company_name", "")).toEqual({
      error: "שם החברה הוא שדה חובה",
    });
  });

  it("refuses a malformed email and accepts a cleared one", () => {
    expect(leadCellPatch("email", "dana@")).toEqual({
      error: "כתובת אימייל לא תקינה",
    });
    expect(leadCellPatch("email", "")).toEqual({ patch: { email: null } });
  });
});

describe("leadCustomCellPatch", () => {
  it("replaces one custom field and keeps the rest of the form data", () => {
    const patch = leadCustomCellPatch(
      { team_size: 3, utm: { source: "fb" } },
      budgetField,
      "12",
    );

    expect(patch).toEqual({
      form_data: { team_size: 12, utm: { source: "fb" } },
    });
  });

  it("removes a custom field that was emptied", () => {
    expect(leadCustomCellPatch({ team_size: 3 }, budgetField, "")).toEqual({
      form_data: {},
    });
  });
});

describe("customFieldEditorKind", () => {
  it("maps custom field types to editors", () => {
    expect(customFieldEditorKind("phone")).toBe("tel");
    expect(customFieldEditorKind("date")).toBe("date");
    expect(customFieldEditorKind("url")).toBe("text");
  });
});
