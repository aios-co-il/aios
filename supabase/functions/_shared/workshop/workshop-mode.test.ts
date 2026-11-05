import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { workshopTurnNote } from "./turn-note.ts";
import {
  isAutoMode,
  MODE_NOTE,
  workshopModeFrom,
  workshopModeOf,
} from "./workshop-mode.ts";

/** A database fake whose every query reads this project payload and empty lists. */
function projectDb(payload: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "lt", "order", "update"]) {
    chain[name] = () => chain;
  }
  chain.maybeSingle = async () => ({ data: { payload }, error: null });
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({ data: [], error: null });
  return { from: () => chain };
}

Deno.test("a project without a mode is semi-automatic", () => {
  assertStrictEquals(workshopModeOf({}), "semi");
  assertStrictEquals(workshopModeFrom("turbo"), "semi");
  assertStrictEquals(workshopModeOf({ workshop_mode: "auto" }), "auto");
  assertStrictEquals(isAutoMode({ workshop_mode: "semi" }), false);
  assertStrictEquals(isAutoMode({ workshop_mode: "auto" }), true);
});

Deno.test("every turn note names the project's mode", async () => {
  const semi = String(
    await workshopTurnNote(projectDb({}), "t1", "item-1", "שלום"),
  );
  assertMatch(semi, /מצב עבודה: חצי אוטומטי/);
  const auto = String(
    await workshopTurnNote(
      projectDb({ workshop_mode: "auto" }),
      "t1",
      "item-1",
      "שלום",
    ),
  );
  assertMatch(auto, /מצב עבודה: אוטומטי/);
  assertMatch(MODE_NOTE.auto, /תקציב/);
});
