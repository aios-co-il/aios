import { expect, test } from "vitest";
import { CLIENT_LIST_COLUMNS, CLIENT_LIST_SELECT } from "./clientListSelect.ts";

test("the clients list select names every listed column", () => {
  const selected = CLIENT_LIST_SELECT.split(/[\s,()]+/);
  for (const column of CLIENT_LIST_COLUMNS) {
    expect(selected.includes(column)).toBeTruthy();
  }
});
