import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

test("a mock clip is edited from its still and a real clip stays video", () => {
  const { manifest, files } = buildWorkshopManifest({
    aspect: "1:1",
    narrationPath: "/tmp/narration.mp3",
    musicPath: "/tmp/music.mp3",
    scenes: [
      {
        id: "a",
        clipPath: "/tmp/a.mp4",
        stillPath: "/tmp/a.png",
        clipProvider: "mock",
        overlayText: "שלום",
        durationS: 3,
      },
      {
        id: "b",
        clipPath: "/tmp/b.mp4",
        stillPath: "/tmp/b.jpg",
        clipProvider: "higgsfield",
        overlayText: "עולם",
        durationS: 4,
      },
    ],
  });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.composition, "WorkshopFilm");
  assert.deepEqual([manifest.width, manifest.height], [1080, 1080]);
  assert.equal(manifest.scenes[0].still, "still-0.png");
  assert.equal(manifest.scenes[0].clip, null);
  assert.equal(manifest.scenes[0].frameCount, 90);
  assert.equal(manifest.scenes[0].move, "push");
  assert.equal(manifest.scenes[0].caption, "שלום");
  assert.equal(manifest.scenes[1].clip, "clip-1.mp4");
  assert.equal(manifest.scenes[1].still, null);
  assert.equal(manifest.scenes[1].startFrame, 90);
  assert.equal(manifest.scenes[1].frameCount, 120);
  assert.equal(manifest.scenes[1].move, "drift-left");
  assert.equal(manifest.totalFrames, 210);
  assert.equal(manifest.narration, "narration.mp3");
  assert.equal(manifest.music, "music.mp3");
  assert.deepEqual(
    files.map((file) => file.to),
    ["still-0.png", "clip-1.mp4", "narration.mp3", "music.mp3"],
  );
});
