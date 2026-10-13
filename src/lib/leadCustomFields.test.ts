import assert from "node:assert/strict";
import test from "node:test";
import {
  getLeadCustomFieldInitialValues,
  getMissingRequiredLeadCustomFields,
  getVisibleLeadCustomFields,
  mergeLeadCustomFieldValues,
} from "./leadCustomFields.ts";
import type { LeadCustomFieldDefinition } from "./leadCustomFields.ts";

const fields: LeadCustomFieldDefinition[] = [
  {
    id: "system",
    field_key: "phone",
    field_label: "טלפון",
    field_type: "phone",
    is_required: false,
    is_visible: true,
    options: [],
    sort_order: 1,
  },
  {
    id: "city",
    field_key: "city",
    field_label: "עיר",
    field_type: "text",
    is_required: true,
    is_visible: true,
    options: [],
    sort_order: 3,
  },
  {
    id: "employees",
    field_key: "employees",
    field_label: "מספר עובדים",
    field_type: "number",
    is_required: false,
    is_visible: true,
    options: [],
    sort_order: 2,
  },
  {
    id: "approved",
    field_key: "approved",
    field_label: "מאושר",
    field_type: "checkbox",
    is_required: true,
    is_visible: true,
    options: [],
    sort_order: 4,
  },
  {
    id: "hidden",
    field_key: "hidden_note",
    field_label: "מוסתר",
    field_type: "text",
    is_required: false,
    is_visible: false,
    options: [],
    sort_order: 5,
  },
];

test("returns only visible non-system lead fields in configured order", () => {
  assert.deepEqual(
    getVisibleLeadCustomFields(fields).map((field) => field.field_key),
    ["employees", "city", "approved"],
  );
});

test("loads field values from form_data with checkbox normalization", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  assert.deepEqual(
    getLeadCustomFieldInitialValues(customFields, {
      city: "חיפה",
      employees: 12,
      approved: "true",
    }),
    { employees: "12", city: "חיפה", approved: true },
  );
});

test("merges custom values without removing unrelated form answers", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  assert.deepEqual(
    mergeLeadCustomFieldValues(
      { campaign_question: "כן", city: "ישן" },
      customFields,
      { employees: "25", city: " תל אביב ", approved: false },
    ),
    {
      campaign_question: "כן",
      city: "תל אביב",
      employees: 25,
      approved: false,
    },
  );
});

test("keeps nested form answers when a custom field uses the same key", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  assert.deepEqual(
    mergeLeadCustomFieldValues(
      { city: { question: "עיר", answer: "חיפה" }, employees: 4 },
      customFields,
      { city: "תל אביב", employees: "9", approved: false },
    ),
    {
      city: { question: "עיר", answer: "חיפה" },
      employees: 9,
      approved: false,
    },
  );
});

test("reports empty required text and unchecked required checkbox fields", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  assert.deepEqual(
    getMissingRequiredLeadCustomFields(customFields, {
      city: " ",
      employees: "",
      approved: false,
    }).map((field) => field.field_key),
    ["city", "approved"],
  );
});
