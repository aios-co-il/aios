import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { REDO_KEY } from "../scene-helpers.ts";
import { pendingStills, stillsRunning } from "./make-stills-scenes.ts";
import { fakeDb, scene } from "./test-fakes.ts";

const scenes = [
  scene("s-1", { still_asset_id: "still-1" }),
  scene("s-2"),
  // The user's own video: it keeps its footage.
  scene("s-3", { clip_asset_id: "clip-3" }),
];

describe("pendingStills", () => {
  it("waits for the scenes without a picture and the ones the project marked to redo", () => {
    const { pending } = pendingStills(scenes, { [REDO_KEY]: ["s-1"] }, false);
    assertEquals(
      pending.map((one) => one.id),
      ["s-1", "s-2"],
    );
  });

  it("redoes every picture on redo, but never the user's own video", () => {
    const { redoIds, pending } = pendingStills(scenes, {}, true);
    assertEquals([...redoIds], ["s-1", "s-2"]);
    assertEquals(
      pending.map((one) => one.id),
      ["s-1", "s-2"],
    );
  });
});

describe("stillsRunning", () => {
  it("is true only while an earlier call's placeholders are pending", async () => {
    const busy = fakeDb({ "workshop_artifacts:select": [{ id: "a-1" }] });
    assertStrictEquals(await stillsRunning(busy, "tenant-1", "item-1"), true);
    const idle = fakeDb({ "workshop_artifacts:select": [] });
    assertStrictEquals(await stillsRunning(idle, "tenant-1", "item-1"), false);
  });
});
