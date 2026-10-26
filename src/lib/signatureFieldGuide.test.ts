import { expect, test } from "vitest";
import type { DocumentField } from "../components/signatures/signatureFieldTypes.ts";
import {
  fieldFillLabel,
  hasAnySignature,
  isFieldFilled,
  isFieldRequired,
  missingRequiredForSubmit,
  nextFieldToFill,
  sortFieldsReadingOrder,
} from "./signatureFieldGuide.ts";

function field(
  partial: Partial<DocumentField> & Pick<DocumentField, "id" | "type">,
): DocumentField {
  return {
    label: "",
    required: false,
    recipient_index: 0,
    position: { x: 10, y: 10, width: 20, height: 5, page: 1 },
    ...partial,
    position: {
      x: 10,
      y: 10,
      width: 20,
      height: 5,
      page: 1,
      ...partial.position,
    },
  };
}

test("isFieldRequired follows the stored flag only", () => {
  expect(isFieldRequired({ required: true })).toBe(true);
  expect(isFieldRequired({ required: false })).toBe(false);
  expect(isFieldRequired({})).toBe(false);
});

test("sortFieldsReadingOrder is page, then y, then right-to-left", () => {
  const fields = [
    field({
      id: "left",
      type: "text",
      position: { x: 10, y: 20, width: 10, height: 4, page: 1 },
    }),
    field({
      id: "right",
      type: "text",
      position: { x: 70, y: 20, width: 10, height: 4, page: 1 },
    }),
    field({
      id: "page2",
      type: "text",
      position: { x: 70, y: 5, width: 10, height: 4, page: 2 },
    }),
    field({
      id: "top",
      type: "text",
      position: { x: 10, y: 5, width: 10, height: 4, page: 1 },
    }),
  ];
  expect(sortFieldsReadingOrder(fields).map((item) => item.id)).toStrictEqual([
    "top",
    "right",
    "left",
    "page2",
  ]);
});

test("nextFieldToFill walks required empties first, then optional, and wraps", () => {
  const fields = [
    field({
      id: "opt",
      type: "text",
      required: false,
      position: { x: 10, y: 10, width: 10, height: 4, page: 1 },
    }),
    field({
      id: "req-a",
      type: "full_name",
      required: true,
      position: { x: 10, y: 20, width: 10, height: 4, page: 1 },
    }),
    field({
      id: "req-b",
      type: "date",
      required: true,
      position: { x: 10, y: 30, width: 10, height: 4, page: 1 },
    }),
  ];
  expect(nextFieldToFill(fields, {})?.id).toBe("req-a");
  expect(nextFieldToFill(fields, { "req-a": "דוד" })?.id).toBe("req-b");
  expect(
    nextFieldToFill(fields, { "req-a": "דוד", "req-b": "2026-09-20" })?.id,
  ).toBe("opt");
  expect(
    nextFieldToFill(fields, { "req-a": "דוד", "req-b": "2026-09-20" }, "opt")
      ?.id,
  ).toBe("opt");
  expect(nextFieldToFill(fields, { "req-a": "דוד" }, "req-b")?.id).toBe("opt");
  expect(
    nextFieldToFill(fields, {
      "req-a": "דוד",
      "req-b": "2026-09-20",
      opt: "הערה",
    }),
  ).toBe(null);
});

test("missingRequiredForSubmit lists required gaps and a signature if none exists", () => {
  const fields = [
    field({ id: "name", type: "full_name", required: true }),
    field({ id: "note", type: "text", required: false }),
    field({ id: "sig", type: "signature", required: false }),
  ];
  const missing = missingRequiredForSubmit(
    fields,
    {},
    { name: "", companyId: "" },
  );
  expect(missing.map((item) => item.id)).toStrictEqual(["name", "sig"]);
  expect(hasAnySignature(fields, { sig: "data:image/png;base64,xx" })).toBe(
    true,
  );
  expect(
    missingRequiredForSubmit(
      fields,
      { name: "דוד", sig: "data:image/png;base64,xx" },
      { name: "", companyId: "" },
    ).length,
  ).toBe(0);
});

test("filled stamp without company details stays missing", () => {
  const fields = [
    field({ id: "stamp", type: "signature_stamp", required: true }),
  ];
  const missing = missingRequiredForSubmit(
    fields,
    { stamp: "data:image/png;base64,xx" },
    { name: "", companyId: "" },
  );
  expect(missing.map((item) => item.id)).toStrictEqual(["stamp"]);
});

test("fieldFillLabel falls back to the placement label", () => {
  expect(fieldFillLabel(field({ id: "t", type: "text" }))).toBe("מילוי");
  expect(
    fieldFillLabel(field({ id: "n", type: "full_name", label: "שם מלא" })),
  ).toBe("שם מלא");
});

test("isFieldFilled ignores whitespace", () => {
  expect(isFieldFilled({ id: "a" }, { a: "  " })).toBe(false);
  expect(isFieldFilled({ id: "a" }, { a: "כן" })).toBe(true);
});
