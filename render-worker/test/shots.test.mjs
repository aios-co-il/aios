import { expect, test } from "vitest";
import {
  buildShots,
  keyframeTime,
  parseShowinfoTimes,
  shotTranscript,
} from "../src/shots.mjs";
import { normalizeFrames } from "../src/analysis.mjs";

test("showinfo pts_time values are parsed", () => {
  const stderr =
    "[Parsed_showinfo_1 @ 0x1] n:   0 pts:  51200 pts_time:2.0     duration\n[Parsed_showinfo_1] n:1 pts_time:5.52 x";
  expect(parseShowinfoTimes(stderr)).toStrictEqual([2, 5.52]);
});

test("cuts become shots; flashes shorter than minShot are dropped", () => {
  const shots = buildShots([2, 2.2, 5, 9.8], 10);
  expect(shots.map((shot) => [shot.start, shot.end])).toStrictEqual([
    [0, 2],
    [2, 5],
    [5, 10],
  ]);
  expect(keyframeTime(shots[1])).toBe(3.5);
});

test("very busy edits are merged down to maxShots", () => {
  const cuts = Array.from({ length: 40 }, (_, index) => index + 1);
  const shots = buildShots(cuts, 41, { maxShots: 10 });
  expect(shots.length).toBe(10);
  expect(shots[0].start).toBe(0);
  expect(shots.at(-1).end).toBe(41);
  expect(Math.round(shots.reduce((sum, shot) => sum + shot.duration, 0))).toBe(
    41,
  );
});

test("transcript words are assigned to the shot they start in", () => {
  const words = [
    { text: "שלום", start: 0.2, type: "word" },
    { text: " ", start: 0.5, type: "spacing" },
    { text: "לכולם", start: 2.1, type: "word" },
  ];
  expect(shotTranscript(words, { start: 0, end: 2 })).toBe("שלום");
  expect(shotTranscript(words, { start: 2, end: 4 })).toBe("לכולם");
});

test("proposal frames follow the reference shots and drop studio names", () => {
  const shots = [
    { index: 1, duration: 2.5, shot_type: "Close-up", motion: "push in" },
    { index: 2, duration: 4 },
  ];
  const frames = normalizeFrames(
    [{ title: "פתיחה", visualPrompt: "A Pixar style fox" }],
    shots,
  );
  expect(frames.length).toBe(2);
  expect(frames[0].duration).toBe(2.5);
  expect(frames[0].visualPrompt).not.toMatch(/pixar/i);
  expect(frames[0].motionPrompt).toBe("push in");
  expect(frames[1].title).toBe("סצנה 2");
});
