import { expect, test } from "vitest";
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
    id: "column-pref",
    field_key: "table_column:notes",
    field_label: "הערות",
    field_type: "textarea",
    is_required: false,
    is_visible: true,
    options: [],
    sort_order: 0,
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
  expect(
    getVisibleLeadCustomFields(fields).map((field) => field.field_key),
  ).toStrictEqual(["employees", "city", "approved"]);
});

test("loads field values from form_data with checkbox normalization", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  expect(
    getLeadCustomFieldInitialValues(customFields, {
      city: "חיפה",
      employees: 12,
      approved: "true",
    }),
  ).toStrictEqual({ employees: "12", city: "חיפה", approved: true });
});

test("merges custom values without removing unrelated form answers", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  expect(
    mergeLeadCustomFieldValues(
      { campaign_question: "כן", city: "ישן" },
      customFields,
      { employees: "25", city: " תל אביב ", approved: false },
    ),
  ).toStrictEqual({
    campaign_question: "כן",
    city: "תל אביב",
    employees: 25,
    approved: false,
  });
});

test("keeps nested form answers when a custom field uses the same key", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  expect(
    mergeLeadCustomFieldValues(
      { city: { question: "עיר", answer: "חיפה" }, employees: 4 },
      customFields,
      { city: "תל אביב", employees: "9", approved: false },
    ),
  ).toStrictEqual({
    city: { question: "עיר", answer: "חיפה" },
    employees: 9,
    approved: false,
  });
});

test("reports empty required text and unchecked required checkbox fields", () => {
  const customFields = getVisibleLeadCustomFields(fields);
  expect(
    getMissingRequiredLeadCustomFields(customFields, {
      city: " ",
      employees: "",
      approved: false,
    }).map((field) => field.field_key),
  ).toStrictEqual(["city", "approved"]);
});
