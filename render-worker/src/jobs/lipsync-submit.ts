/** Submits the lip sync to the first provider that can take it, and saves its job id on the run. */
import { finalError } from "../guard.ts";
import { isPaidPlanError } from "../providers/plan.ts";
import type { LipsyncProvider, ProviderKeys } from "../providers/types.ts";
import type { SupabaseRest } from "../supabaseRest.ts";
import type {
  LipsyncSource,
  MediaAsset,
  RunItem,
  SceneRow,
  VideoRun,
} from "./types.ts";
import { providerInput } from "./lipsync-input.ts";

export const NO_LIPSYNC_PROVIDER =
  "lipsync run: no lip-sync provider is connected (is required): connect an ElevenLabs key (paid plan), a Kling key pair, an OpenRouter key or a Higgsfield key to the tenant";

/**
 * Tries the providers in order: the first that accepts the job is used. Returns the provider,
 * its job id and the picture it animates.
 */
export async function submitLipsync({
  db,
  run,
  item,
  names,
  providerFor,
  keys,
  scene,
  still,
  clip,
  motion,
  voice,
  line,
  durationS,
  aspect,
  log,
}: {
  db: Pick<SupabaseRest, "select" | "download" | "upload" | "sign" | "update">;
  run: VideoRun;
  item: RunItem;
  names: Array<string>;
  providerFor: (name: string, keys: ProviderKeys) => LipsyncProvider;
  keys: ProviderKeys;
  scene: SceneRow;
  still: MediaAsset | null;
  clip: MediaAsset | null;
  motion: MediaAsset | null;
  voice: MediaAsset;
  line: string;
  durationS: number;
  aspect: string;
  log: (line: string) => void;
}): Promise<LipsyncJob> {
  let job: LipsyncJob | null = null;
  let lastError: unknown = null;
  for (const name of names) {
    const candidate = providerFor(name, keys);
    // A clip-based lip sync re-times the mouth of the clip with the movement in it.
    const picture = candidate.needs === "video" ? (motion ?? clip) : still;
    if (!picture) {
      lastError = new Error(
        `${name} lip sync needs the scene ${candidate.needs === "video" ? "clip" : "still"}`,
      );
      continue;
    }
    try {
      const input = await providerInput(db, run, item, candidate, {
        picture,
        voice,
        line,
        speaker: String(scene.meta?.speaker ?? "").trim() || null,
        motionPrompt: scene.motion_prompt,
        durationS,
        aspect,
      });
      const { jobId } = await candidate.submit(input);
      job = {
        provider: candidate,
        jobId,
        source: {
          kind: candidate.needs === "video" ? "clip" : "still",
          asset_id: picture.id,
        },
      };
      break;
    } catch (error) {
      lastError = error;
      // Only a plan that cannot make video, or a rejected key, moves on to the next provider;
      // nothing was accepted, so nothing was charged.
      if (
        !isPaidPlanError(error) &&
        !/\b40[13]\b|invalid credentials|model_access_denied/i.test(
          String(messageOf(error)),
        )
      )
        throw error;
      log(
        `[lipsync] ${run.id} ${name} unavailable: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  if (!job)
    throw finalError(
      `lipsync run: ${messageOf(lastError) ?? NO_LIPSYNC_PROVIDER}`,
    );
  const { provider, jobId, source } = job;
  try {
    await db.update("marketing_runs", `id=eq.${run.id}`, {
      provider: provider.name,
      provider_job_id: jobId,
      output: { ...(run.output ?? {}), lipsync_source: source },
    });
  } catch (error) {
    throw finalError(
      `${provider.name} lip-sync job ${jobId} was submitted but could not be saved (${error instanceof Error ? error.message : error}); not retried to avoid paying again`,
    );
  }
  return job;
}

/** `error.message` when `error` is an object, as `error?.message` read it; else undefined. */
function messageOf(error: unknown): unknown {
  return typeof error === "object" && error !== null
    ? Reflect.get(error, "message")
    : undefined;
}

/** A lip-sync job a provider holds: the provider, its job id and the picture it animates. */
export interface LipsyncJob {
  provider: LipsyncProvider;
  jobId: string;
  source: LipsyncSource | null;
}
