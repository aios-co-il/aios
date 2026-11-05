/**
 * Planning prices for a film production, shown to the user before any spend. The parts are
 * priced in cost-scene.ts (clips, voice, music) and lipsync-cost.ts (talking scenes).
 */

import {
  type CostScene,
  clipEstimate,
  musicEstimate,
  roundUsd,
  voiceEstimate,
} from "./cost-scene.ts";
import {
  OPENROUTER_TALKING_USD_PER_SECOND,
  lipsyncEstimate,
  lipsyncPassScenes,
  lipsyncPassUsd,
  relipEstimate,
  sceneTalkingLine,
  veoSeconds,
} from "./lipsync-cost.ts";
import { type SceneEngine, type VideoConnections } from "./scene-engine.ts";

/**
 * The price to approve: the scenes produce_video animates, plus `relip`, talking scenes kept as
 * they are that only need a new voice line and lip sync (relipEstimate). The narration and music
 * it makes are priced for `options.film` when given (the workshop passes the whole storyboard).
 * The worker moves a clip that a paid engine refuses to OpenRouter when the tenant has it
 * (render-worker/src/clip-fallback.ts), so the quote covers the dearer one.
 */
export function quotedProductionEstimate(
  engine: SceneEngine,
  scenes: CostScene[],
  options: ProductionOptions,
  connections: VideoConnections = {},
  relip: CostScene[] = [],
) {
  const own = withLipsyncFallback(
    productionEstimate(engine, scenes, options),
    engine,
    scenes,
    connections,
  );
  const fallback =
    engine === "mock" || engine === "openrouter" || !connections.openrouter
      ? null
      : productionEstimate("openrouter", scenes, options);
  const quote =
    fallback && fallback.totalUsd > own.totalUsd
      ? { ...fallback, pricedOn: "openrouter" as SceneEngine }
      : { ...own, pricedOn: engine };
  const again = relipEstimate(relip, connections);
  if (again.usd === 0) return quote;
  return {
    ...quote,
    lipsync: {
      usd: roundUsd(quote.lipsync.usd + again.usd),
      credits: quote.lipsync.credits,
    },
    talkingScenes:
      quote.talkingScenes +
      relip.filter((scene) => sceneTalkingLine(scene)).length,
    totalUsd: roundUsd(quote.totalUsd + again.usd),
  };
}

/**
 * Trailer sound design: the whole set, made once per film with ElevenLabs sound effects in the
 * production's own render (render-worker jobs/sound-effects-catalog.ts): six gentle transition
 * sounds (5.5 s together, a different one at each cut) and one soft impact (2 s). 7.5 s at 40
 * credits a second at $0.0003 a credit is $0.09. A render outside a production never pays.
 */
export const SOUND_EFFECTS_USD = 0.09;

export interface ProductionOptions {
  withVoice: boolean;
  withMusic: boolean;
  /** Trailer sound effects, made in the production's render (see SOUND_EFFECTS_USD). */
  withSoundEffects?: boolean;
  /**
   * The whole storyboard, when only some scenes are animated: produce_video narrates the whole
   * script again and makes one bed for the whole film, so withVoice and withMusic price these.
   */
  film?: CostScene[];
}

/** Everything produce_video will queue for scenes that have a still and no clip yet. */
export function productionEstimate(
  engine: SceneEngine,
  scenes: CostScene[],
  options: ProductionOptions,
) {
  const clips = clipEstimate(engine, scenes);
  const film = options.film ?? scenes;
  // A talking scene is not narrated; its own line is priced with its lip sync.
  const spoken = film.filter(
    (scene) => !scene.lipsync && scene.voiceover_text.trim(),
  );
  const voice =
    options.withVoice && spoken.length > 0
      ? voiceEstimate(spoken)
      : { usd: 0, credits: 0 };
  const music = options.withMusic
    ? musicEstimate(film)
    : { usd: 0, credits: 0 };
  const talking = lipsyncEstimate(engine, scenes);
  const lipsync = { usd: talking.usd, credits: talking.credits };
  const soundEffects = options.withSoundEffects
    ? { usd: SOUND_EFFECTS_USD, credits: 0 }
    : { usd: 0, credits: 0 };
  return {
    clips: { usd: clips.usd, credits: clips.credits },
    voice,
    music,
    lipsync,
    soundEffects,
    talkingScenes: talking.scenes,
    totalUsd: roundUsd(
      clips.usd + voice.usd + music.usd + lipsync.usd + soundEffects.usd,
    ),
    clipSeconds: clips.seconds,
  };
}

/**
 * A talking scene on an engine that cannot speak goes through the worker's lip-sync chain, which
 * ends at OpenRouter Veo when the tenant has it (render-worker providers/lipsync.ts): quote that.
 */
function withLipsyncFallback(
  estimate: ReturnType<typeof productionEstimate>,
  engine: SceneEngine,
  scenes: CostScene[],
  connections: VideoConnections,
) {
  // A line in the chosen voice never goes to Veo, which would speak it in its own voice.
  const pass = lipsyncPassScenes(engine, scenes).filter(
    (scene) => scene.chosen_voice !== true,
  );
  if (!connections.openrouter || pass.length === 0) return estimate;
  const own = lipsyncPassUsd(pass);
  const veo = roundUsd(
    pass.reduce(
      (sum, scene) =>
        sum + veoSeconds(scene.duration_s) * OPENROUTER_TALKING_USD_PER_SECOND,
      0,
    ),
  );
  if (veo <= own) return estimate;
  return {
    ...estimate,
    lipsync: {
      usd: roundUsd(estimate.lipsync.usd - own + veo),
      credits: estimate.lipsync.credits,
    },
    totalUsd: roundUsd(estimate.totalUsd - own + veo),
  };
}
