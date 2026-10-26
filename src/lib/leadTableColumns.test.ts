import { expect, test } from "vitest";
import {
  applyLeadTableColumnWidths,
  formatLeadFilesColumn,
  formatLeadTableFieldValue,
  getLeadTableCustomColumns,
  isLeadTableColumnVisible,
  LEAD_TABLE_COLUMN_FIELDS,
  LEAD_TABLE_COLUMN_WIDTHS_STORAGE_KEY,
  LEAD_TABLE_OPTIONAL_COLUMNS,
  LEAD_TABLE_TOGGLEABLE_COLUMNS,
  parseLeadTableColumnWidths,
  readLeadCustomColumnValue,
  readLeadTableColumnWidths,
  writeLeadTableColumnWidths,
} from "./leadTableColumns.ts";

test("name and actions stay visible even when the org hides them", () => {
  const hidden = () => false;
  expect(isLeadTableColumnVisible("contact_name", hidden)).toBe(true);
  expect(isLeadTableColumnVisible("actions", hidden)).toBe(true);
});

test("optional columns follow org visibility, defaulting to shown", () => {
  const visibility: Record<string, boolean> = { tags: false };
  const isFieldVisible = (key: string, fallback = true) =>
    key in visibility ? visibility[key] : fallback;

  expect(isLeadTableColumnVisible("tags", isFieldVisible)).toBe(false);
  expect(isLeadTableColumnVisible("phone", isFieldVisible)).toBe(true);
});

test("added columns stay hidden until their own preference is on", () => {
  const visibility: Record<string, boolean> = {
    "table_column:notes": true,
  };
  const isFieldVisible = (key: string, fallback = true) =>
    key in visibility ? visibility[key] : fallback;

  expect(isLeadTableColumnVisible("notes", isFieldVisible)).toBe(true);
  expect(isLeadTableColumnVisible("files", isFieldVisible)).toBe(false);
  expect(isLeadTableColumnVisible("call_recording", isFieldVisible)).toBe(
    false,
  );
  expect(isLeadTableColumnVisible("phone", isFieldVisible)).toBe(true);
  expect(
    LEAD_TABLE_OPTIONAL_COLUMNS.some((field) => field.key === "notes"),
  ).toBeTruthy();
  expect(
    !LEAD_TABLE_OPTIONAL_COLUMNS.some((field) => field.key === "phone"),
  ).toBeTruthy();
});

test("custom columns skip system fields and table preferences", () => {
  const columns = getLeadTableCustomColumns(
    [
      {
        field_key: "phone",
        field_label: "טלפון",
        field_type: "phone",
        sort_order: 1,
      },
      {
        field_key: "table_column:notes",
        field_label: "הערות",
        field_type: "textarea",
        sort_order: 0,
      },
      {
        field_key: "employees",
        field_label: "מספר עובדים",
        field_type: "number",
        sort_order: 2,
      },
    ],
    new Set(["phone"]),
  );
  expect(columns.map((field) => field.visibilityKey)).toStrictEqual([
    "table_column:employees",
  ]);
  expect(readLeadCustomColumnValue({ employees: 12 }, "employees")).toBe(12);
  expect(readLeadCustomColumnValue("nope", "employees")).toBe(null);
});

test("formats dates, checkboxes, and file counts", () => {
  expect(formatLeadTableFieldValue("2026-10-13", "date")).toBe("13/10/2026");
  expect(formatLeadTableFieldValue(true, "checkbox")).toBe("כן");
  expect(formatLeadTableFieldValue("", "text")).toBe("—");
  expect(
    formatLeadFilesColumn({
      attachments: [{}],
      folder_links: [],
      folder_link: " https://files.example ",
    }),
  ).toBe("2 קבצים");
  expect(formatLeadFilesColumn({})).toBe("—");
});

test("parseLeadTableColumnWidths keeps known CRM columns inside bounds", () => {
  const widths = parseLeadTableColumnWidths(
    JSON.stringify({
      name: 240.4,
      phone: 10,
      tags: 9000,
      unknown: 300,
      "cf:employees": 180,
      status: "nope",
    }),
  );
  expect(widths).toStrictEqual({
    name: 240,
    phone: 80,
    tags: 800,
    "cf:employees": 180,
  });
});

test("column widths round-trip through storage", () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };
  writeLeadTableColumnWidths({ company: 220, nope: 100 }, storage);
  expect(saved.has(LEAD_TABLE_COLUMN_WIDTHS_STORAGE_KEY)).toBe(true);
  expect(readLeadTableColumnWidths(storage)).toStrictEqual({ company: 220 });
  expect(readLeadTableColumnWidths(null)).toStrictEqual({ company: 220 });
  expect(
    applyLeadTableColumnWidths(
      [
        { id: "company", width: 170 },
        { id: "phone", width: 130 },
      ],
      readLeadTableColumnWidths(storage),
    ),
  ).toStrictEqual([
    { id: "company", width: 220 },
    { id: "phone", width: 130 },
  ]);
});

test("toggleable catalog excludes required columns", () => {
  expect(
    LEAD_TABLE_TOGGLEABLE_COLUMNS.some((field) => field.key === "tags"),
  ).toBeTruthy();
  expect(
    !LEAD_TABLE_TOGGLEABLE_COLUMNS.some(
      (field) => field.key === "contact_name",
    ),
  ).toBeTruthy();
  expect(
    LEAD_TABLE_COLUMN_FIELDS.filter((field) => field.required)
      .map((field) => field.key)
      .join(","),
  ).toBe("contact_name,actions");
});
