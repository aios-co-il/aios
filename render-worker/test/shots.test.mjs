import assert from "node:assert/strict";
import test from "node:test";
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
  assert.deepEqual(parseShowinfoTimes(stderr), [2, 5.52]);
});

test("cuts become shots; flashes shorter than minShot are dropped", () => {
  const shots = buildShots([2, 2.2, 5, 9.8], 10);
  assert.deepEqual(
    shots.map((shot) => [shot.start, shot.end]),
    [
      [0, 2],
      [2, 5],
      [5, 10],
    ],
  );
  assert.equal(keyframeTime(shots[1]), 3.5);
});

test("very busy edits are merged down to maxShots", () => {
  const cuts = Array.from({ length: 40 }, (_, index) => index + 1);
  const shots = buildShots(cuts, 41, { maxShots: 10 });
  assert.equal(shots.length, 10);
  assert.equal(shots[0].start, 0);
  assert.equal(shots.at(-1).end, 41);
  assert.equal(
    Math.round(shots.reduce((sum, shot) => sum + shot.duration, 0)),
    41,
  );
});

test("transcript words are assigned to the shot they start in", () => {
  const words = [
    { text: "שלום", start: 0.2, type: "word" },
    { text: " ", start: 0.5, type: "spacing" },
    { text: "לכולם", start: 2.1, type: "word" },
  ];
  assert.equal(shotTranscript(words, { start: 0, end: 2 }), "שלום");
  assert.equal(shotTranscript(words, { start: 2, end: 4 }), "לכולם");
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
  assert.equal(frames.length, 2);
  assert.equal(frames[0].duration, 2.5);
  assert.doesNotMatch(frames[0].visualPrompt, /pixar/i);
  assert.equal(frames[0].motionPrompt, "push in");
  assert.equal(frames[1].title, "סצנה 2");
});
