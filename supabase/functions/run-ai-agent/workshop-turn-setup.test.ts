import { assertStrictEquals } from "jsr:@std/assert@1";
import { loadWorkshopMode } from "./workshop-turn-setup.ts";

/** A client whose project read answers `answer`. */
function db(answer: { data: unknown; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq"]) {
    chain[name] = () => chain;
  }
  chain.maybeSingle = async () => answer;
  return { from: () => chain };
}

Deno.test("the open project's mode reaches the turn", async () => {
  const auto = db({
    data: { payload: { workshop_mode: "auto" } },
    error: null,
  });
  assertStrictEquals(await loadWorkshopMode(auto, "t1", "item-1"), "auto");
  const unset = db({ data: { payload: {} }, error: null });
  assertStrictEquals(await loadWorkshopMode(unset, "t1", "item-1"), "semi");
});

Deno.test("no project, or a failed read, is semi-automatic", async () => {
  const auto = db({
    data: { payload: { workshop_mode: "auto" } },
    error: null,
  });
  assertStrictEquals(await loadWorkshopMode(auto, "t1", null), "semi");
  assertStrictEquals(await loadWorkshopMode(auto, null, "item-1"), "semi");
  const failed = db({ data: null, error: { message: "down" } });
  assertStrictEquals(await loadWorkshopMode(failed, "t1", "item-1"), "semi");
});
