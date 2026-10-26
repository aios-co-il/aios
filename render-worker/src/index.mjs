// Video Studio worker. Claims queued marketing_runs by kind and runs up to CONCURRENCY of
// them at once, so one slow or failed clip never holds up the others.
import { createSupabaseRest } from "./supabaseRest.mjs";
import { analyzeReference } from "./jobs/referenceAnalysis.mjs";
import { failClip, generateClip } from "./jobs/clip.mjs";
import { generateMusic, generateVoice } from "./jobs/sound.mjs";
import { renderFilm } from "./jobs/render.mjs";
import { getVideoProvider } from "./providers/index.mjs";

const HANDLERS = {
  reference_analysis: {
    run: async (ctx) =>
      analyzeReference({ ...ctx, keys: await resolveKeys(ctx.run.tenant_id) }),
  },
  clip: {
    run: async (ctx) => {
      const keys = await resolveMediaKeys(ctx.run.tenant_id);
      const name =
        ctx.run.input?.provider || process.env.VIDEO_PROVIDER || "mock";
      // Read from Vault only for the engine that needs it.
      if (name === "openrouter")
        keys.openRouterKey = await openRouterKey(ctx.run.tenant_id);
      return generateClip({
        ...ctx,
        provider: getVideoProvider(name, keys),
      });
    },
    onFailed: failClip,
  },
  voice: {
    run: async (ctx) =>
      generateVoice({
        ...ctx,
        apiKey: (await resolveMediaKeys(ctx.run.tenant_id)).elevenLabsKey,
      }),
  },
  music: {
    run: async (ctx) =>
      generateMusic({
        ...ctx,
        apiKey: (await resolveMediaKeys(ctx.run.tenant_id)).elevenLabsKey,
      }),
  },
  render: {
    run: (ctx) => renderFilm(ctx),
  },
};
const POLL_MS = Number(process.env.POLL_MS) || 5000;
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 8);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 3;
const WORKER_ID = process.env.WORKER_ID || `render-worker-${process.pid}`;

const db = createSupabaseRest({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

/** Env keys first, then the tenant's LLM integration (the same place the Edge Functions read). */
async function resolveKeys(tenantId) {
  let openaiKey = process.env.OPENAI_API_KEY || null;
  if (!openaiKey) {
    const rows = await db.select(
      "tenant_integrations",
      `tenant_id=eq.${tenantId}&integration_type=eq.llm&is_active=eq.true&select=settings&order=updated_at.desc&limit=1`,
    );
    openaiKey = rows?.[0]?.settings?.openai_api_key || null;
  }
  if (!openaiKey)
    throw new Error(
      "No OpenAI key: set OPENAI_API_KEY or the tenant LLM integration",
    );
  const media = await resolveMediaKeys(tenantId);
  return { openaiKey, elevenLabsKey: media.elevenLabsKey };
}

/**
 * Keys for scene and sound engines. The tenant's own key wins, so each tenant pays for its
 * own generations; the env key is only a fallback for the agency's own workspace.
 */
async function resolveMediaKeys(tenantId) {
  const rows = await db.select(
    "tenant_integrations",
    `tenant_id=eq.${tenantId}&integration_type=eq.llm&is_active=eq.true&select=settings&order=updated_at.desc&limit=1`,
  );
  const settings = rows?.[0]?.settings ?? {};
  return {
    elevenLabsKey:
      settings.elevenlabs_api_key || process.env.ELEVENLABS_API_KEY || null,
    higgsfieldKeyId:
      settings.higgsfield_api_key_id || process.env.HF_API_KEY_ID || null,
    higgsfieldKeySecret:
      settings.higgsfield_api_key_secret ||
      process.env.HF_API_KEY_SECRET ||
      null,
    klingAccessKey:
      settings.kling_access_key || process.env.KLING_ACCESS_KEY || null,
    klingSecretKey:
      settings.kling_secret_key || process.env.KLING_SECRET_KEY || null,
  };
}

/**
 * The tenant's OpenRouter key: the first OpenRouter brain connected in Carmen
 * settings (מוחות, חיבורים ומפתחות AI), read from Vault. No env fallback, so
 * every tenant pays for its own generations.
 */
async function openRouterKey(tenantId) {
  const rows = await db.select(
    "carmen_brain_connections",
    `tenant_id=eq.${tenantId}&kind=eq.chat_model&provider_preset=eq.openrouter&key_last4=not.is.null&select=id&order=created_at.asc&limit=1`,
  );
  const id = rows?.[0]?.id;
  if (!id) return null;
  const secret = await db.rpc("carmen_brain_secret_get", {
    p_connection_id: id,
  });
  return typeof secret === "string" && secret ? secret : null;
}

const PRODUCTION_KINDS = new Set(["clip", "voice", "music", "render"]);

/**
 * One-click production: after each clip, voice, music or render job the project's
 * production moves on (queues the assembly once nothing is in flight, then finishes).
 */
async function advanceProduction(run) {
  if (!PRODUCTION_KINDS.has(run.kind) || !run.item_id) return;
  try {
    const state = await db.rpc("advance_video_production", {
      p_item_id: run.item_id,
    });
    if (state && state !== "idle")
      console.log(`[worker] production ${run.item_id}: ${state}`);
  } catch (error) {
    console.error(
      `[worker] production ${run.item_id} advance failed`,
      error instanceof Error ? error.message : error,
    );
  }
}

async function finish(run, patch) {
  await db.update("marketing_runs", `id=eq.${run.id}`, {
    finished_at: new Date().toISOString(),
    ...patch,
  });
}

async function processOne() {
  const claimed = await db.rpc("claim_video_run", {
    p_kinds: Object.keys(HANDLERS),
    p_worker: WORKER_ID,
  });
  const run = Array.isArray(claimed) ? claimed[0] : null;
  if (!run) return false;
  console.log(
    `[worker] claimed ${run.kind} ${run.id} (attempt ${run.attempts})`,
  );
  try {
    const result = await HANDLERS[run.kind].run({ db, run });
    await finish(run, {
      status: "completed",
      error: null,
      output: { ...(run.output ?? {}), ...result.output },
      cost_usd: result.costUsd ?? 0,
      tokens_in: result.tokensIn ?? 0,
      tokens_out: result.tokensOut ?? 0,
      credits: result.credits ?? null,
      provider: result.provider ?? "render-worker",
    });
    console.log(`[worker] completed ${run.id}`);
    await advanceProduction(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry =
      run.attempts < MAX_ATTEMPTS &&
      !(error && error.final) &&
      !/limit is|is required|No OpenAI key|no approved clips/.test(message);
    console.error(
      `[worker] ${run.id} failed (${retry ? "will retry" : "final"}): ${message}`,
    );
    await finish(run, {
      status: retry ? "queued" : "failed",
      error: message.slice(0, 2000),
    });
    if (!retry)
      await HANDLERS[run.kind]
        .onFailed?.({ db, run })
        .catch((hookError) =>
          console.error(`[worker] ${run.id} failure hook`, hookError),
        );
    // After the scene is marked failed, so the film is assembled without it.
    if (!retry) await advanceProduction(run);
  }
  return true;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => (stopping = true));

/** One slot: claim, process, repeat; sleeps only when the queue is empty. */
async function slot() {
  while (!stopping) {
    let worked = false;
    try {
      worked = await processOne();
    } catch (error) {
      console.error(
        "[worker] poll error",
        error instanceof Error ? error.message : error,
      );
    }
    if (!worked) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

console.log(
  `[worker] ${WORKER_ID} polling ${Object.keys(HANDLERS).join(", ")} every ${POLL_MS}ms with ${CONCURRENCY} slots`,
);
await Promise.all(Array.from({ length: CONCURRENCY }, slot));
