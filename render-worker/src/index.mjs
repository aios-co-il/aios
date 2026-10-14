// Video Studio worker. Claims queued marketing_runs by kind and runs up to CONCURRENCY of
// them at once, so one slow or failed clip never holds up the others.
import { createSupabaseRest } from "./supabaseRest.mjs";
import { analyzeReference } from "./jobs/referenceAnalysis.mjs";
import { failClip, generateClip } from "./jobs/clip.mjs";

const HANDLERS = {
  reference_analysis: {
    run: async (ctx) =>
      analyzeReference({ ...ctx, keys: await resolveKeys(ctx.run.tenant_id) }),
  },
  clip: { run: generateClip, onFailed: failClip },
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
  return { openaiKey, elevenLabsKey: process.env.ELEVENLABS_API_KEY || null };
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry =
      run.attempts < MAX_ATTEMPTS &&
      !/limit is|is required|No OpenAI key/.test(message);
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
