/**
 * The film settings workshop_produce_video saves on the project before the production starts, and
 * the options it passes to produce_video.
 */

import { isEndCardBackground, isEndCardStyle } from "../film-look.ts";
import { asRecord } from "../record.ts";
import type { SceneEngine } from "../scene-engine.ts";
import { isSceneOverlay } from "../scene-overlays.ts";
import { isTitleEmphasis } from "../title-emphasis.ts";
import { isFilmFont, isTitleSize, isTitleStyle } from "../title-styles.ts";
import type { ProductionQuote } from "./produce-video-quote.ts";

/** What the production chose: its engine, sound design, kept design and voice. */
export interface ProductionChoices {
  engine: SceneEngine;
  soundDesign: boolean;
  keepDesign: boolean;
  voiceId: string | null | undefined;
}

/**
 * payload.video with the production's choices and the look settings the call asked for; each
 * setting is kept only when it is a known value.
 */
export function productionVideo(
  payload: Record<string, unknown>,
  args: Record<string, unknown>,
  choices: ProductionChoices,
) {
  const { voiceId } = choices;
  return {
    // From the gated payload: it holds the pictures' approval (stills-approval.ts).
    ...asRecord(payload.video),
    scene_engine: choices.engine,
    sound_engine: "elevenlabs",
    sound_design: choices.soundDesign,
    keep_design: choices.keepDesign,
    // How the scenes' text enters, how large it is and how its key words are emphasised
    // (title-styles.ts, title-emphasis.ts).
    ...(isTitleStyle(args.title_style)
      ? { title_style: args.title_style }
      : {}),
    ...(isTitleSize(args.title_size) ? { title_size: args.title_size } : {}),
    ...(isTitleEmphasis(args.title_emphasis)
      ? { title_emphasis: args.title_emphasis }
      : {}),
    ...(isFilmFont(args.font) ? { font: args.font } : {}),
    // The graphics over every scene's picture (scene-overlays.ts).
    ...(isSceneOverlay(args.scene_overlay)
      ? { scene_overlay: args.scene_overlay }
      : {}),
    // The closing card's design, its background and its glass (film-look.ts).
    ...(isEndCardStyle(args.end_card_style)
      ? { end_card_style: args.end_card_style }
      : {}),
    ...(isEndCardBackground(args.end_card_background)
      ? { end_card_background: args.end_card_background }
      : {}),
    ...(typeof args.end_card_glass === "boolean"
      ? { end_card_glass: args.end_card_glass }
      : {}),
    // The narration is checked against this voice; a new one re-narrates the film.
    ...(voiceId ? { voice_id: voiceId } : {}),
  };
}

/** produce_video's options: the aspect, the engine, the quote it may spend and the sound. */
export function productionOptions(
  format: string,
  engine: SceneEngine,
  stageId: string | null,
  quote: ProductionQuote,
  musicPrompt: string,
) {
  const { estimate } = quote;
  return {
    aspect: format,
    provider: engine,
    // Free-preview clips are priced in costScenes, so the paid engine may redo them.
    redo_preview: true,
    estimate: {
      clips: estimate.clips,
      voice: estimate.voice,
      music: estimate.music,
      lipsync: estimate.lipsync,
      sound_effects: estimate.soundEffects,
    },
    stage_id: stageId,
    with_voice: quote.withVoice,
    with_music: quote.withMusic,
    voice_id: quote.voiceId,
    music_prompt: musicPrompt,
    generate_audio: false,
  };
}
