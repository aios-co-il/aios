import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  EFFECT_LUFS,
  IMPACT_LUFS,
  TRAILER,
  VOICE_LUFS,
  mixProfile,
} from "../src/compose/music-bed.mjs";
import { cutSoundOrder } from "../src/compose/transition-sounds.mjs";
import {
  SOUND_EFFECTS,
  SOUND_EFFECT_NAMES,
  TRANSITION_NAMES,
  soundEffectsCostUsd,
} from "../src/jobs/sound-effects-catalog.mjs";
import { db } from "./media.mjs";

const ITEM = "22222222-2222-2222-2222-222222222222";

test("every cut gets a different sound: all of the set before any repeat, never twice in a row", () => {
  for (const seed of [ITEM, "a", "b", "", "film-42"]) {
    for (const sounds of [2, 3, 6]) {
      for (const cuts of [1, 5, 6, 7, 13, 40]) {
        const order = cutSoundOrder(sounds, cuts, seed);
        expect(order.length).toBe(cuts);
        expect(
          order.every((s) => Number.isInteger(s) && s >= 0 && s < sounds),
        ).toBe(true);
        // No two cuts in a row play the same sound.
        for (let i = 1; i < order.length; i++)
          expect(order[i]).not.toBe(order[i - 1]);
        // Each round of `sounds` cuts plays every sound once.
        for (let from = 0; from + sounds <= cuts; from += sounds)
          expect(new Set(order.slice(from, from + sounds)).size).toBe(sounds);
        // As many cuts as sounds or fewer: no sound plays twice.
        const head = order.slice(0, sounds);
        expect(new Set(head).size).toBe(head.length);
      }
    }
  }
  // The film's id draws the order: the same on every render, another film another order.
  expect(cutSoundOrder(6, 10, ITEM)).toStrictEqual(cutSoundOrder(6, 10, ITEM));
  const orders = new Set(
    ["a", "b", "c", "d", "e"].map((seed) => cutSoundOrder(6, 6, seed).join("")),
  );
  expect(orders.size).toBeGreaterThan(1);
  // A set of one plays at every cut; no sounds or no cuts play nothing.
  expect(cutSoundOrder(1, 3, ITEM)).toStrictEqual([0, 0, 0]);
  expect(cutSoundOrder(0, 3, ITEM)).toStrictEqual([]);
  expect(cutSoundOrder(6, 0, ITEM)).toStrictEqual([]);
});

test("the set: six short, subtle transition sounds and one soft impact", () => {
  expect(TRANSITION_NAMES).toStrictEqual([
    "air",
    "shimmer",
    "blip",
    "swish",
    "chime",
    "swipe",
  ]);
  expect(SOUND_EFFECT_NAMES).toStrictEqual([...TRANSITION_NAMES, "impact"]);
  const texts = new Set();
  for (const name of TRANSITION_NAMES) {
    const sound = SOUND_EFFECTS[name];
    expect(sound.durationS).toBeGreaterThanOrEqual(0.6);
    expect(sound.durationS).toBeLessThanOrEqual(1.2);
    expect(sound.text).toMatch(/subtle/i);
    expect(sound.text).toMatch(/no heavy impact/i);
    expect(sound.text).toMatch(/no music/i);
    texts.add(sound.text.split(":")[0]);
  }
  // Each one a different character.
  expect(texts.size).toBe(TRANSITION_NAMES.length);
  expect(SOUND_EFFECTS.impact.text).toMatch(/soft/i);
  expect(SOUND_EFFECTS.impact.text).toMatch(/no music/i);
});

test("the quote prices the whole set at what ElevenLabs bills for it", () => {
  const cost = readFileSync(
    new URL(
      "../../supabase/functions/_shared/workshop/video-cost.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const quoted = Number(
    /export const SOUND_EFFECTS_USD = ([0-9.]+);/.exec(cost)?.[1],
  );
  const set = soundEffectsCostUsd(SOUND_EFFECT_NAMES);
  // 7.5 s at 40 credits a second and $0.0003 a credit.
  expect(set).toBe(0.09);
  expect(quoted).toBeGreaterThanOrEqual(set);
  expect(quoted - set).toBeLessThan(0.01);
});

test("the trailer mix keeps the effects gentle: over the bed between lines, far under the voice", () => {
  for (const voiceLufs of [null, -17, -19.1, -21]) {
    const mix = mixProfile({ trailer: true, voiceLufs });
    const voice = voiceLufs ?? VOICE_LUFS;
    // A transition sound arrives with its hit at EFFECT_LUFS (sound-prep.mjs).
    const solo = EFFECT_LUFS + db(mix.effects);
    const under = EFFECT_LUFS + db(mix.effectsDucked);
    expect(solo - TRAILER.bedLufs).toBeGreaterThanOrEqual(3);
    expect(solo - TRAILER.bedLufs).toBeLessThanOrEqual(5);
    expect(voice - under).toBeGreaterThanOrEqual(10);
    // Under her voice the sound is still above the ducked bed.
    const bedUnder = voice - TRAILER.underVoiceDb;
    expect(under).toBeGreaterThan(bedUnder);
  }
  // The impact is softer than a transition sound, and than before (hit -14 at 0.7, -17.1).
  const mix = mixProfile({ trailer: true });
  expect(IMPACT_LUFS).toBeLessThan(EFFECT_LUFS);
  expect(IMPACT_LUFS + db(mix.effects)).toBeLessThan(-14 + db(0.7) - 3);
  expect(IMPACT_LUFS + db(mix.effectsDucked)).toBeLessThan(-14 + db(0.35) - 9);
});
