// Video Studio worker. Claims queued marketing_runs by kind and processes them one at a time.
import { createSupabaseRest } from "./supabaseRest.mjs";
import { analyzeReference } from "./jobs/referenceAnalysis.mjs";

const HANDLERS = { reference_analysis: analyzeReference };
const POLL_MS = Number(process.env.POLL_MS) || 5000;
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
    const result = await HANDLERS[run.kind]({
      db,
      run,
      keys: await resolveKeys(run.tenant_id),
    });
    await finish(run, {
      status: "completed",
      error: null,
      output: { ...(run.output ?? {}), ...result.output },
      cost_usd: result.costUsd ?? 0,
      tokens_in: result.tokensIn ?? 0,
      tokens_out: result.tokensOut ?? 0,
      provider: "render-worker",
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
  }
  return true;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => (stopping = true));

console.log(
  `[worker] ${WORKER_ID} polling ${Object.keys(HANDLERS).join(", ")} every ${POLL_MS}ms`,
);
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
