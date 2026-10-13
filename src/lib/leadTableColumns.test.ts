import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(isLeadTableColumnVisible("contact_name", hidden), true);
  assert.equal(isLeadTableColumnVisible("actions", hidden), true);
});

test("optional columns follow org visibility, defaulting to shown", () => {
  const visibility: Record<string, boolean> = { tags: false };
  const isFieldVisible = (key: string, fallback = true) =>
    key in visibility ? visibility[key] : fallback;

  assert.equal(isLeadTableColumnVisible("tags", isFieldVisible), false);
  assert.equal(isLeadTableColumnVisible("phone", isFieldVisible), true);
});

test("added columns stay hidden until their own preference is on", () => {
  const visibility: Record<string, boolean> = {
    "table_column:notes": true,
  };
  const isFieldVisible = (key: string, fallback = true) =>
    key in visibility ? visibility[key] : fallback;

  assert.equal(isLeadTableColumnVisible("notes", isFieldVisible), true);
  assert.equal(isLeadTableColumnVisible("files", isFieldVisible), false);
  assert.equal(
    isLeadTableColumnVisible("call_recording", isFieldVisible),
    false,
  );
  assert.equal(isLeadTableColumnVisible("phone", isFieldVisible), true);
  assert.ok(LEAD_TABLE_OPTIONAL_COLUMNS.some((field) => field.key === "notes"));
  assert.ok(
    !LEAD_TABLE_OPTIONAL_COLUMNS.some((field) => field.key === "phone"),
  );
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
  assert.deepEqual(
    columns.map((field) => field.visibilityKey),
    ["table_column:employees"],
  );
  assert.equal(readLeadCustomColumnValue({ employees: 12 }, "employees"), 12);
  assert.equal(readLeadCustomColumnValue("nope", "employees"), null);
});

test("formats dates, checkboxes, and file counts", () => {
  assert.equal(formatLeadTableFieldValue("2026-10-13", "date"), "13/10/2026");
  assert.equal(formatLeadTableFieldValue(true, "checkbox"), "כן");
  assert.equal(formatLeadTableFieldValue("", "text"), "—");
  assert.equal(
    formatLeadFilesColumn({
      attachments: [{}],
      folder_links: [],
      folder_link: " https://files.example ",
    }),
    "2 קבצים",
  );
  assert.equal(formatLeadFilesColumn({}), "—");
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
  assert.deepEqual(widths, {
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
  assert.equal(saved.has(LEAD_TABLE_COLUMN_WIDTHS_STORAGE_KEY), true);
  assert.deepEqual(readLeadTableColumnWidths(storage), { company: 220 });
  assert.deepEqual(readLeadTableColumnWidths(null), { company: 220 });
  assert.deepEqual(
    applyLeadTableColumnWidths(
      [{ id: "company", width: 170 }, { id: "phone", width: 130 }],
      readLeadTableColumnWidths(storage),
    ),
    [{ id: "company", width: 220 }, { id: "phone", width: 130 }],
  );
});

test("toggleable catalog excludes required columns", () => {
  assert.ok(LEAD_TABLE_TOGGLEABLE_COLUMNS.some((field) => field.key === "tags"));
  assert.ok(!LEAD_TABLE_TOGGLEABLE_COLUMNS.some((field) => field.key === "contact_name"));
  assert.equal(
    LEAD_TABLE_COLUMN_FIELDS.filter((field) => field.required).map((field) => field.key).join(","),
    "contact_name,actions",
  );
});
