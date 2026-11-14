// Safety net for Carmen's meeting bots.
//
// `bot.done` fires when the bot leaves, but the transcript artifact is often
// still processing, and copying a long meeting's video can outlive the webhook
// invocation. Both cases leave a session stuck in `processing`. This runs on a
// schedule, re-checks those sessions against Recall, and finishes them.
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import {
  finalizeMeetingBotSession,
  type MeetingBotSession,
} from "../_shared/meeting-bot-finalize.ts";
import {
  claimSessionIngest,
  INGEST_ERROR,
  notLiveIngestFilter,
} from "../_shared/meeting-bot/ingest-claim.ts";

import { retryVideoStorage } from "./video-retry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Give Recall a moment to finish the transcript before the first retry.
const MIN_AGE_SECONDS = 90;
const BATCH_SIZE = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = serviceClient();

  let sessionId: string | null = null;
  try {
    const body = await req.json();
    sessionId = body?.session_id ?? null;
  } catch {
    /* scheduled invocation sends no body */
  }

  // Re-copies videos whose storage failed or never ran (AIO-588).
  if (!sessionId) {
    await retryVideoStorage(Date.now());
  }

  let query = admin
    .from("meeting_bot_sessions")
    .select(
      "id, tenant_id, client_id, lead_id, agency_id, campaigner_ids, summary_scope, platform, meeting_topic, external_bot_id, zoom_recording_id, scheduled_start, joined_at, ended_at, created_by, updated_at",
    )
    .not("external_bot_id", "is", null);

  if (sessionId) {
    query = query.eq("id", sessionId);
  } else {
    const cutoff = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();
    // Only `processing` — a bot still in the call must not be finalized early —
    // and not a session the webhook is ingesting right now (AIO-587).
    query = query
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .or(notLiveIngestFilter(Date.now()))
      .order("updated_at", { ascending: true })
      .limit(BATCH_SIZE);
  }

  const { data: sessions, error } = await query;
  if (error) return json({ error: error.message }, 500);
  if (!sessions?.length) return json({ processed: 0, results: [] });

  const results: Array<ReconcileResult> = [];
  for (const session of sessions) {
    results.push(await reconcileSession(admin, session));
  }

  return json({ processed: results.length, results });
});

type ReconcileResult = { session_id: string; outcome: string; detail: string };

/**
 * Claim the session the way the webhook does, then finalize it. A lost claim
 * means another run owns the ingest; a failed finalize stays retryable.
 */
async function reconcileSession(
  admin: DbClient,
  session: MeetingBotSession & { updated_at: string },
): Promise<ReconcileResult> {
  let claimed: boolean;
  try {
    claimed = await claimSessionIngest(admin, session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meeting-bot-reconcile] claim failed", session.id, msg);
    return { session_id: session.id, outcome: "error", detail: msg };
  }
  if (!claimed) {
    return {
      session_id: session.id,
      outcome: "skipped",
      detail: "already claimed",
    };
  }

  try {
    const result = await finalizeMeetingBotSession(admin, session);
    return { session_id: session.id, ...result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meeting-bot-reconcile] failed", session.id, msg);
    const { error } = await admin
      .from("meeting_bot_sessions")
      .update({
        status_detail: INGEST_ERROR,
        error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", session.tenant_id)
      .eq("id", session.id);
    if (error) {
      console.error("[meeting-bot-reconcile] error not recorded", error);
    }
    return { session_id: session.id, outcome: "error", detail: msg };
  }
}
