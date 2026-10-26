import { describe, expect, it } from "vitest";
import {
  documentFieldsToJson,
  signaturePositionToJson,
} from "./signatureFieldsJson";

describe("signature serializers", () => {
  it("keep every field value", () => {
    const position = { x: 1, y: 2, width: 3, height: 4, page: 1 };
    expect(signaturePositionToJson(position)).toEqual(position);
    const field = {
      id: "f1",
      type: "signature" as const,
      label: "Sign",
      position,
      recipient_index: 0,
    };
    const json = documentFieldsToJson([field]);
    expect(json).toEqual([field]);
    expect(JSON.stringify(json)).toBe(JSON.stringify([field]));
  });
});
