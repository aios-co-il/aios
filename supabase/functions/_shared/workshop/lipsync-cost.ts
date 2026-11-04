/**
 * Planning prices for talking scenes: the lip-sync pass, Veo 3.1 on OpenRouter, and a kept scene
 * lip-synced again to a new line.
 */

import { OPENROUTER_USD_PER_SECOND } from "./clip-prices.ts";
import {
  type CostScene,
  type Estimate,
  openRouterBilledSeconds,
  roundUsd,
  voiceEstimate,
} from "./cost-scene.ts";
import {
  type SceneEngine,
  type VideoConnections,
  sceneClipSeconds,
  speaksNatively,
} from "./scene-engine.ts";
import { talkingLine } from "./talking.ts";

/** Veo 3.1 for a talking scene. */
export const OPENROUTER_TALKING_USD_PER_SECOND = 0.4;

/** Veo 3.1 renders 4, 6 or 8 s; OpenRouter makes a talking scene on it. */
export const veoSeconds = (duration: number) => {
  const seconds = Number(duration) || 5;
  return seconds <= 4 ? 4 : seconds <= 6 ? 6 : 8;
};

/**
 * Lip sync, planning price per second of talking video until the first paid run. ElevenLabs
 * Creatify Aurora, Kling lip-sync, HeyGen Avatar IV (on OpenRouter) and Higgsfield
 * Seedance 2.5 all bill by length; the worker picks the first one the tenant has a key for
 * (render-worker/src/providers/lipsync.ts).
 */
export const LIPSYNC_USD_PER_SECOND = 0.1;

export const sceneTalkingLine = (scene: CostScene) =>
  talkingLine(
    { lipsync: scene.lipsync === true, dialogue: scene.dialogue },
    scene.voiceover_text,
  );

/**
 * Talking scenes that go through the worker's lip-sync pass on this engine: every scene in the
 * chosen voice, and all of them on an engine that cannot speak.
 */
export const lipsyncPassScenes = (engine: SceneEngine, scenes: CostScene[]) =>
  scenes.filter(
    (scene) =>
      sceneTalkingLine(scene) &&
      (scene.chosen_voice === true || !speaksNatively(engine)),
  );

/** A lip-sync pass: the scene's own voice line plus the lip sync, priced by length. */
export function lipsyncPassUsd(scenes: CostScene[]) {
  if (scenes.length === 0) return 0;
  const seconds = scenes.reduce(
    (sum, scene) => sum + Math.max(1, Math.ceil(Number(scene.duration_s) || 5)),
    0,
  );
  const voice = voiceEstimate(
    scenes.map((scene) => ({
      ...scene,
      voiceover_text: sceneTalkingLine(scene),
    })),
  );
  return roundUsd(seconds * LIPSYNC_USD_PER_SECOND + voice.usd);
}

/**
 * Talking scenes. On an engine that speaks, the clip already carries the line (no extra), unless
 * the line is in the chosen voice. Otherwise each talking scene pays for its own voice line plus
 * a lip-sync pass.
 */
export function lipsyncEstimate(engine: SceneEngine, scenes: CostScene[]) {
  const talking = scenes.filter((scene) => sceneTalkingLine(scene));
  const pass = lipsyncPassScenes(engine, scenes);
  const spokenByEngine = talking.filter((scene) => !pass.includes(scene));
  // OpenRouter makes a talking scene on Veo 3.1 with audio instead of the Kling clip that
  // clipEstimate already counted; only the difference is added here.
  const veoExtra =
    engine === "openrouter" && spokenByEngine.length > 0
      ? Math.max(
          0,
          spokenByEngine.reduce(
            (sum, scene) =>
              sum +
              veoSeconds(scene.duration_s) * OPENROUTER_TALKING_USD_PER_SECOND -
              openRouterBilledSeconds(
                sceneClipSeconds(engine, scene.duration_s),
              ) *
                OPENROUTER_USD_PER_SECOND,
            0,
          ),
        )
      : 0;
  return {
    usd: roundUsd(veoExtra + lipsyncPassUsd(pass)),
    credits: 0,
    scenes: talking.length,
    // Every talking scene is spoken by the engine itself: no lip-sync pass at all.
    native: talking.length > 0 && pass.length === 0,
  };
}

/**
 * Talking scenes whose clip is kept but does not say the current line (say, a line changed on the
 * board): the production records the line and lip-syncs the scene again (queue_video_lipsync),
 * with no new clip. Priced as a lip-sync pass, or as Veo where the worker's chain can end there.
 */
export function relipEstimate(
  scenes: CostScene[],
  connections: VideoConnections = {},
): Estimate {
  const talking = scenes.filter((scene) => sceneTalkingLine(scene));
  const chosen = talking.filter((scene) => scene.chosen_voice === true);
  const others = talking.filter((scene) => scene.chosen_voice !== true);
  const veo = connections.openrouter
    ? roundUsd(
        others.reduce(
          (sum, scene) =>
            sum +
            veoSeconds(scene.duration_s) * OPENROUTER_TALKING_USD_PER_SECOND,
          0,
        ),
      )
    : 0;
  return {
    usd: roundUsd(
      lipsyncPassUsd(chosen) + Math.max(lipsyncPassUsd(others), veo),
    ),
    credits: 0,
  };
}
