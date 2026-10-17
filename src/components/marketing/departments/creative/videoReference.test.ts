import assert from "node:assert/strict";
import test from "node:test";
import {
  isReferenceRunActive,
  proposalToFrames,
  referenceVideoPath,
} from "./videoReference.ts";

test("reference path is tenant-first and keeps a safe extension", () => {
  assert.equal(
    referenceVideoPath({
      tenantId: "t",
      clientId: null,
      itemId: "i",
      fileName: "My Ad.MOV",
      now: 5,
    }),
    "t/general/i/reference/reference-5.mov",
  );
});

test("proposal frames become fresh draft frames with clamped durations", () => {
  let n = 0;
  const frames = proposalToFrames(
    [
      { title: "פתיחה", duration: 2.5, motionPrompt: "slow push in" },
      { duration: 99 },
    ],
    (order) => -(order - 1) * 300,
    () => `id-${++n}`,
  );
  assert.deepEqual(
    frames.map((frame) => [frame.id, frame.order, frame.duration]),
    [
      ["id-1", 1, 2.5],
      ["id-2", 2, 30],
    ],
  );
  assert.equal(frames[0].motionPrompt, "slow push in");
  assert.equal(frames[1].title, "סצנה 2");
  assert.equal(frames[1].status, "draft");
});

test("queued and running runs are active", () => {
  assert.equal(isReferenceRunActive({ status: "queued" }), true);
  assert.equal(isReferenceRunActive({ status: "completed" }), false);
  assert.equal(isReferenceRunActive(null), false);
});
