// The rows the jobs read and write through PostgREST. Rows are untrusted JSON: each type names
// only the columns and keys its callers read, and the callers test the values they rely on.

/**
 * A marketing_runs row as claim_video_run returns it. Tenant members write `input`, so the
 * worker never trusts a path or URL from it (guard.ts).
 */
export interface VideoRun {
  id: string;
  tenant_id: string;
  kind: string;
  item_id: string | null;
  scene_id: string | null;
  stage_id: string | null;
  attempts: number;
  provider: string | null;
  provider_job_id: string | null;
  input: RunInput | null;
  output: RunOutput | null;
}

/** What the screen or Carmen asked for when queueing the run. */
export interface RunInput {
  provider?: string;
  aspect?: string;
  continuous?: boolean;
  duration_s?: number;
  generate_audio?: boolean;
  goal?: string;
  motion_prompt?: string | null;
  music_length_ms?: number;
  path?: string;
  prompt?: string;
  scene_ids?: Array<string>;
  voice_id?: string;
  estimate?: { usd?: number; credits?: number };
  /** Anything else a tenant member wrote; no job reads it. */
  [key: string]: unknown;
}

/** A run's output: what each job recorded (paths, providers, errors), merged on finish. */
export interface RunOutput {
  audio_path?: string;
  /** What the sound run's provider said about its audio (jobs/audio-store.ts). */
  audio_meta?: AudioMeta;
  /** The picture a lip sync animates (jobs/lipsync-submit.ts). */
  lipsync_source?: LipsyncSource | null;
  /** The film's sound effects stored by this run, by effect name (jobs/sound-effects.ts). */
  sound_effects?: Record<string, unknown>;
  /** What this run paid for each sound effect, in USD, by effect name. */
  sound_effects_cost_usd?: Record<string, unknown>;
  sound_effects_error?: string | null;
  [key: string]: unknown;
}

/** The picture a lip sync animates: the scene's still or clip asset. */
export interface LipsyncSource {
  kind: "clip" | "still";
  asset_id: string;
}

/** A marketing_assets row a lip sync reads: a stored file, with the meta it was made with. */
export interface MediaAsset {
  id: string;
  url: string;
  meta?: RowMeta | null;
}

/** What a sound job records about its audio: the engine, its voice, timings and price. */
export interface AudioMeta {
  provider?: string;
  model?: string;
  voice_id?: string | null;
  alignment?: unknown;
  pronunciations?: Record<string, string>;
  cost_usd?: unknown;
  characters?: unknown;
  music_length_ms?: unknown;
  /** How the music bed's length was found (jobs/music.ts bedLength). */
  music_basis?: string;
  [key: string]: unknown;
}

/** The marketing_assets columns the jobs select: a clip, still, voice, music or render. */
export interface AssetRow {
  id: string;
  type: string;
  url?: string | null;
  meta?: unknown;
}

/** A marketing_work_items row as loadRunItem reads it. */
export interface WorkItemRow {
  id: string;
  tenant_id: string;
  client_id: string | null;
}

/** A work item checked against its run, with the storage folder its files go in (guard.ts). */
export interface RunItem extends WorkItemRow {
  folder: string;
}

/** A marketing_work_items row read for its payload: the brief, the brand kit and the film. */
export interface PayloadRow {
  payload?: WorkItemPayload | null;
}

/** The payload keys the jobs read; brand keys are read by compose/brand.ts. */
export interface WorkItemPayload {
  brief_text?: unknown;
  copy_text?: unknown;
  video?: FilmPayload | null;
  [key: string]: unknown;
}

/** payload.video: the film's settings, chosen in the Workshop or by Carmen. */
export interface FilmPayload {
  caption_style?: unknown;
  end_card_background?: unknown;
  end_card_glass?: unknown;
  end_card_style?: unknown;
  font?: unknown;
  keep_design?: unknown;
  scene_overlay?: unknown;
  sound_design?: unknown;
  title_emphasis?: unknown;
  title_size?: unknown;
  title_style?: unknown;
  production?: {
    status?: string;
    render_run_id?: unknown;
    /** The approved quote's line items (clips, music, sound_effects). */
    estimate?: { sound_effects?: { usd?: unknown }; [item: string]: unknown };
  } | null;
}

/** The marketing_video_scenes columns the jobs select; which ones a row has depends on the select. */
export interface SceneRow {
  id: string;
  position?: number | null;
  status?: string | null;
  overlay_text?: string | null;
  voiceover_text?: string | null;
  visual_prompt?: string | null;
  motion_prompt?: string | null;
  duration_s?: number | null;
  clip_asset_id?: string | null;
  voice_asset_id?: string | null;
  still_asset_id?: string | null;
  meta?: RowMeta | null;
}

/**
 * The `meta` keys the jobs read on scenes and assets (see metaOf in rows.ts). A scene's meta says
 * how it is played (lipsync, dialogue, its look); an asset's says how it was made.
 */
export interface RowMeta {
  // Scene meta.
  lipsync?: unknown;
  chosen_voice?: unknown;
  dialogue?: unknown;
  speaker?: unknown;
  reference_url?: unknown;
  skin_switch?: unknown;
  transition?: unknown;
  title_style?: unknown;
  title_size?: unknown;
  title_emphasis?: unknown;
  scene_overlay?: unknown;
  // Asset meta.
  /** Word timings: an ElevenLabs character alignment or a word list (captions.ts). */
  alignment?: unknown;
  asset_id?: string | null;
  aspect?: string | null;
  cost_usd?: unknown;
  effect?: string;
  model?: unknown;
  motion_clip_asset_id?: string | null;
  music_basis?: unknown;
  music_length_ms?: unknown;
  provider?: string | null;
  source_asset_id?: string | null;
  source_kind?: string | null;
  text?: unknown;
  url?: unknown;
  version?: unknown;
  voice_asset_id?: string | null;
  voice_id?: unknown;
  [key: string]: unknown;
}
