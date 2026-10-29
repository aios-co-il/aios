import { expect, test } from "vitest";
import { kickerTitle } from "../src/compose/kicker.mjs";
import { mixProfile } from "../src/compose/music-bed.mjs";
import { MIX } from "../src/compose/workshop-edit.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

test("a short scene title becomes a kicker unless it repeats the line", () => {
  expect(kickerTitle("אנליסטית", "היא קוראת את הנתונים")).toBe("אנליסטית");
  expect(kickerTitle("SEO ו-GEO", "מקדמת אותך בגוגל")).toBe("SEO ו-GEO");
  // A name inside a longer line is still a title.
  expect(kickerTitle("כרמן", "הכירו את כרמן. מנהלת השיווק של העסק שלך.")).toBe(
    "כרמן",
  );
  expect(kickerTitle("  כרמן.   מנהלת השיווק שלך. ", "הירשמו")).toBe(
    "כרמן. מנהלת השיווק שלך.",
  );
  // The line itself, most of it, or a title that holds the whole line: no kicker.
  expect(kickerTitle("הכירו את כרמן!", "הכירו את כרמן")).toBe(null);
  expect(kickerTitle("מנהלת השיווק שלך", "מנהלת השיווק שלך היום")).toBe(null);
  expect(kickerTitle("יומן חכם לעסק", "יומן")).toBe(null);
  // Niqqud, punctuation and case do not hide a repeat.
  expect(kickerTitle("הַכִּירוּ אֶת כַּרְמֵן", "הכירו את כרמן.")).toBe(null);
  expect(kickerTitle("SEO, GEO", "seo geo")).toBe(null);
  // Too long: six words, or more than 32 characters.
  expect(kickerTitle("אחת שתיים שלוש ארבע חמש שש", "")).toBe(null);
  expect(kickerTitle("כותרת ארוכה מאוד שלא נכנסת בשורה אחת", "")).toBe(null);
  expect(kickerTitle("", "x")).toBe(null);
  expect(kickerTitle("!!!", "")).toBe(null);
});

const still = (id, extra = {}) => ({
  id,
  clipPath: `/tmp/${id}.mp4`,
  stillPath: `/tmp/${id}.png`,
  clipProvider: "mock",
  durationS: 2,
  ...extra,
});

const spoken = (text, from, to) => {
  const chars = [...text];
  const step = (to - from) / chars.length;
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => from + i * step),
    character_end_times_seconds: chars.map((_, i) => from + (i + 1) * step),
  };
};

test("the manifest loops a short bed, mixes a trailer and sets kickers over karaoke", () => {
  const timeline = {
    aspect: "16:9",
    narrationPath: "/tmp/n.mp3",
    narrationAlignment: spoken("שלום לכולם ותודה", 0, 3),
    musicPath: "/tmp/m.wav",
    musicDurationS: 2,
    musicBodyS: 1.8,
    soundDesign: true,
    voiceLufs: -19,
    brand: { ctaText: "הירשמו עכשיו" },
    scenes: [
      still("a", {
        overlayText: "אנליסטית",
        voiceoverText: "שלום לכולם",
        narrationText: "שלום לכולם",
      }),
      still("b", {
        overlayText: "ותודה",
        voiceoverText: "ותודה",
        narrationText: "ותודה",
      }),
    ],
  };
  const { manifest } = buildWorkshopManifest(timeline);
  expect(manifest.scenes.map((s) => s.kicker)).toStrictEqual([
    "אנליסטית",
    null,
  ]);
  const loops = manifest.musicLoops;
  expect(loops.length).toBeGreaterThan(1);
  expect(loops[0]).toMatchObject({ startFrame: 0, frameCount: 54 });
  expect(loops.at(-1).startFrame + loops.at(-1).frameCount).toBe(
    manifest.totalFrames,
  );
  const trailer = mixProfile({ trailer: true, voiceLufs: -19 });
  expect(manifest.musicEnvelope.volumes[0]).toBe(trailer.musicDucked);
  expect(manifest.musicEnvelope.volumes.at(-1)).toBe(trailer.music);
  // Without sound design the bed keeps today's levels.
  const plain = buildWorkshopManifest({
    ...timeline,
    soundDesign: false,
  }).manifest;
  expect(plain.musicEnvelope.volumes[0]).toBe(MIX.musicDucked);
  expect(plain.musicEnvelope.volumes.at(-1)).toBe(MIX.music);
  // An unmeasured bed has no loops: the composition loops the track itself.
  const unmeasured = buildWorkshopManifest({
    ...timeline,
    musicDurationS: 0,
  }).manifest;
  expect("musicLoops" in unmeasured).toBe(false);
});
