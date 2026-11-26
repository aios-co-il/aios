/**
 * SQL cannot import the contract, so the table's CHECK constraints list the statuses and
 * the card rules again. These tests read the newest migration that defines each
 * constraint and fail when its list and the contract's list differ.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { DEVICE_CARD_RULES } from "../_shared/carmen/device/card-rule.ts";
import { DEVICE_ACTION_STATUS } from "../_shared/carmen/device/contract.ts";

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

/** The quoted values of `column IN (...)` in the newest migration that defines the constraint. */
function checkedValues(constraint: string, column: string): Array<string> {
  const list = new RegExp(
    `CONSTRAINT ${constraint}\\s+CHECK \\([^;]*?\\b${column} IN \\(([^)]*)\\)`,
  );
  const files = [...Deno.readDirSync(MIGRATIONS)]
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const lists = files
    .map((name) => Deno.readTextFileSync(new URL(name, MIGRATIONS)).match(list))
    .filter((match) => match !== null);
  const newest = lists.at(-1)?.[1] ?? "";

  return [...newest.matchAll(/'([^']*)'/g)].map((quoted) => quoted[1]);
}

Deno.test("carmen_device_actions lists", async (t) => {
  await t.step("the status check lists DEVICE_ACTION_STATUS", () => {
    assertEquals(checkedValues("carmen_device_actions_status_chk", "status"), [
      ...DEVICE_ACTION_STATUS,
    ]);
  });

  await t.step("the decision check lists DEVICE_CARD_RULES", () => {
    assertEquals(
      checkedValues("carmen_device_actions_decision_chk", "decision"),
      [...DEVICE_CARD_RULES],
    );
  });
});
