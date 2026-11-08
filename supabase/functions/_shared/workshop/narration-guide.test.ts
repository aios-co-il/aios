import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  guideLine,
  guidePathIn,
  guideRecordingPath,
  isGuidePathOf,
} from "./narration-guide.ts";

const PATH = "tenant-1/client-1/item-1/narration/guide-1700000000000.webm";

Deno.test("the board's path is the project's narration folder", () => {
  assertStrictEquals(
    guideRecordingPath({
      tenantId: "tenant-1",
      clientId: "client-1",
      itemId: "item-1",
      extension: "webm",
      now: 1700000000000,
    }),
    PATH,
  );
  assertStrictEquals(
    guideRecordingPath({
      tenantId: "t",
      clientId: null,
      itemId: "i",
      extension: "exe",
      now: 1,
    }),
    "t/general/i/narration/guide-1.webm",
  );
});

Deno.test("the line the board sends is read back to its path", () => {
  assertStrictEquals(guidePathIn(guideLine(PATH)), PATH);
  assertStrictEquals(guidePathIn(`${guideLine(PATH)}\nתודה`), PATH);
  assertStrictEquals(guidePathIn("תפיקי"), null);
  assertStrictEquals(guidePathIn(null), null);
});

Deno.test("only a recording of this project in this tenant is accepted", () => {
  assert(isGuidePathOf(PATH, "tenant-1", "item-1"));
  const refused = [
    PATH.replace("tenant-1", "tenant-2"),
    PATH.replace("item-1", "item-2"),
    PATH.replace("narration", "reference"),
    PATH.replace("guide-1700000000000.webm", "voice-run.audio"),
    "tenant-1/../item-1/narration/guide-1.webm",
    `tenant-1/client-1/item-1/narration/x/guide-1.webm`,
  ];
  assertEquals(
    refused.filter((path) => isGuidePathOf(path, "tenant-1", "item-1")),
    [],
  );
});
