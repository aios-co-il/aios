import { describe, expect, it } from "vitest";
import {
  applyColumnOrder,
  moveColumnId,
  parseColumnOrder,
} from "./resizableTableColumnOrder";

const columns = ["name", "phone", "status", "actions"].map((id) => ({ id }));

describe("applyColumnOrder", () => {
  it("shows columns in the saved order", () => {
    const ordered = applyColumnOrder(columns, [
      "status",
      "name",
      "actions",
      "phone",
    ]);
    expect(ordered.map((c) => c.id)).toEqual([
      "status",
      "name",
      "actions",
      "phone",
    ]);
  });

  it("keeps a newly enabled column after the column it follows by default", () => {
    const withEmail = [
      { id: "name" },
      { id: "phone" },
      { id: "email" },
      { id: "status" },
      { id: "actions" },
    ];
    const ordered = applyColumnOrder(withEmail, [
      "status",
      "phone",
      "name",
      "actions",
    ]);
    expect(ordered.map((c) => c.id)).toEqual([
      "status",
      "phone",
      "email",
      "name",
      "actions",
    ]);
  });

  it("drops saved ids for columns that are hidden now", () => {
    const ordered = applyColumnOrder(columns, ["gone", "actions", "name"]);
    expect(ordered.map((c) => c.id)).toEqual([
      "actions",
      "name",
      "phone",
      "status",
    ]);
  });
});

describe("moveColumnId", () => {
  it("moves the dragged column into the drop target's position", () => {
    const ids = ["name", "phone", "status", "actions"];
    expect(moveColumnId(ids, "actions", "phone")).toEqual([
      "name",
      "actions",
      "phone",
      "status",
    ]);
    expect(moveColumnId(ids, "name", "status")).toEqual([
      "phone",
      "status",
      "name",
      "actions",
    ]);
  });

  it("ignores unknown ids", () => {
    const ids = ["name", "phone"];
    expect(moveColumnId(ids, "missing", "phone")).toBe(ids);
  });
});

describe("parseColumnOrder", () => {
  it("keeps string ids and ignores malformed values", () => {
    expect(parseColumnOrder('["phone","name"]')).toEqual(["phone", "name"]);
    expect(parseColumnOrder("{bad")).toEqual([]);
    expect(parseColumnOrder('{"a":1}')).toEqual([]);
    expect(parseColumnOrder('["a",2,"b"]')).toEqual(["a", "b"]);
    expect(parseColumnOrder(null)).toEqual([]);
  });
});
