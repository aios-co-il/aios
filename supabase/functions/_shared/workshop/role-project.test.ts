import assert from "node:assert/strict";
import { test } from "node:test";
import { workshopItemIdFrom } from "./role-project.ts";

test("the open project id comes from the body or the workshop context line", () => {
  const id = "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  assert.equal(workshopItemIdFrom({ workshop_item_id: id }), id);
  assert.equal(
    workshopItemIdFrom({
      system_prompt_addon: `=== הסדנה של כרמן ===\nפרויקט פתוח: item_id=${id} (סרטון)`,
    }),
    id,
  );
  assert.equal(
    workshopItemIdFrom({ system_prompt_addon: "אין פרויקט פתוח." }),
    null,
  );
});
