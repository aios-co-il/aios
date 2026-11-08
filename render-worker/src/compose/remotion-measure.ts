/** What the Remotion edit measures of the film's media before it builds the manifest. */
import type { ProbeResult } from "../ffmpeg.ts";
import type {
  CutSound,
  Timeline,
  TimelineEffects,
  TimelineScene,
} from "./types.ts";

/** Media lengths and audio tracks the edit needs; an unreadable file keeps the defaults. */
export async function measured(
  timeline: Timeline,
  probeFile: (
    file: string,
  ) => Promise<Pick<ProbeResult, "duration" | "hasAudio">>,
): Promise<Timeline> {
  const read = async (file: string) => {
    try {
      return await probeFile(file);
    } catch {
      return null;
    }
  };
  const scenes: Array<TimelineScene> = [];
  for (const scene of timeline.scenes) {
    const clip = scene.clipPath ? await read(scene.clipPath) : null;
    const voice = scene.voicePath ? await read(scene.voicePath) : null;
    const move = scene.moveClipPath ? await read(scene.moveClipPath) : null;
    scenes.push({
      ...scene,
      clipHasAudio: clip ? clip.hasAudio : scene.clipHasAudio,
      clipDurationS: clip?.duration || scene.clipDurationS || 0,
      voiceDurationS: voice?.duration || scene.voiceDurationS || 0,
      ...(scene.moveClipPath
        ? {
            moveClipDurationS: move?.duration || scene.moveClipDurationS || 0,
          }
        : {}),
    });
  }
  const narration = timeline.narrationPath
    ? await read(timeline.narrationPath)
    : null;
  const music = timeline.musicPath ? await read(timeline.musicPath) : null;
  let effects: TimelineEffects | null = null;
  if (timeline.effects) {
    // Each cut's sound with its length (a file two cuts share is read once).
    const lengths = new Map<string, number>();
    const cuts: Array<CutSound> = [];
    for (const cut of timeline.effects.cuts ?? []) {
      if (!lengths.has(cut.path)) {
        lengths.set(cut.path, (await read(cut.path))?.duration || 0);
      }
      cuts.push({ ...cut, durationS: lengths.get(cut.path) });
    }
    effects = {
      ...timeline.effects,
      cuts,
      impactDurationS: timeline.effects.impactPath
        ? (await read(timeline.effects.impactPath))?.duration || 0
        : 0,
    };
  }
  return {
    ...timeline,
    scenes,
    effects,
    narrationDurationS: narration?.duration || timeline.narrationDurationS || 0,
    // The bed's length, so a track shorter than the film is looped (musicLoops).
    musicDurationS: music?.duration || timeline.musicDurationS || 0,
  };
}
