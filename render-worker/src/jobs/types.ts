// The rows the jobs read and write through PostgREST.

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
  goal?: string;
  music_length_ms?: number;
  path?: string;
  prompt?: string;
  scene_ids?: Array<string>;
  voice_id?: string;
  estimate?: { usd?: number };
}

/** A run's output: what each job recorded (paths, providers, errors), merged on finish. */
export type RunOutput = Record<string, unknown>;

/** The marketing_assets columns the jobs select: a clip, still, voice, music or render. */
export interface AssetRow {
  id: string;
  type: string;
  url?: string | null;
  meta?: unknown;
}
