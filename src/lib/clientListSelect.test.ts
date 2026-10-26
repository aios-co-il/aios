import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_LIST_COLUMNS, CLIENT_LIST_SELECT } from "./clientListSelect.ts";

test("the clients list select names every listed column", () => {
  const selected = CLIENT_LIST_SELECT.split(/[\s,()]+/);
  for (const column of CLIENT_LIST_COLUMNS) {
    assert.ok(selected.includes(column), `${column} missing from select`);
  }
});
