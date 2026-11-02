import { expect, test } from "vitest";
import {
  isReferenceRunActive,
  proposalToFrames,
  referenceVideoPath,
} from "./videoReference.ts";

test("reference path is tenant-first and keeps a safe extension", () => {
  expect(
    referenceVideoPath({
      tenantId: "t",
      clientId: null,
      itemId: "i",
      fileName: "My Ad.MOV",
      now: 5,
    }),
  ).toBe("t/general/i/reference/reference-5.mov");
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
  expect(
    frames.map((frame) => [frame.id, frame.order, frame.duration]),
  ).toStrictEqual([
    ["id-1", 1, 2.5],
    ["id-2", 2, 30],
  ]);
  expect(frames[0].motionPrompt).toBe("slow push in");
  expect(frames[1].title).toBe("סצנה 2");
  expect(frames[1].status).toBe("draft");
});

test("queued and running runs are active", () => {
  expect(isReferenceRunActive({ status: "queued" })).toBe(true);
  expect(isReferenceRunActive({ status: "completed" })).toBe(false);
  expect(isReferenceRunActive(null)).toBe(false);
});
