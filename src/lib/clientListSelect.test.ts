import { describe, expect, test } from "vitest";
import { CLIENT_LIST_COLUMNS, CLIENT_LIST_SELECT } from "./clientListSelect.ts";
describe("clientListSelect", () => {
  test("the clients list select names exactly the listed columns, in order", () => {
    const ownColumns = CLIENT_LIST_SELECT.slice(
      0,
      CLIENT_LIST_SELECT.indexOf("agencies ("),
    )
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    expect(ownColumns).toStrictEqual([...CLIENT_LIST_COLUMNS]);
  });
});
