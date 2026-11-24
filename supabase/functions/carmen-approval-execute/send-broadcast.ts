import { FunctionsHttpError } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** Claim eligible broadcasts before rebuilding recipients; failed preparation stays unsendable. */
export async function sendApprovedBroadcast(
  db: DbClient,
  tenantId: string,
  broadcastId: string,
  enqueue: (
    revision: string,
  ) => Promise<{ total?: number; count?: number; revision: string }>,
) {
  const { data: claimed, error } = await db
    .from("broadcasts")
    .update({ status: "paused" })
    .eq("id", broadcastId)
    .eq("tenant_id", tenantId)
    .in("status", ["draft", "scheduled"])
    .select("id, updated_at")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!claimed) {
    throw new Error("broadcast_not_eligible");
  }
  let revision = claimed.updated_at;
  try {
    const recipients = await enqueue(revision);
    if (
      !recipients ||
      typeof recipients.revision !== "string" ||
      !recipients.revision
    ) {
      throw new Error("missing_enqueue_revision");
    }
    revision = recipients.revision;
    const { data: started, error: startError } = await db
      .from("broadcasts")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", broadcastId)
      .eq("tenant_id", tenantId)
      .eq("status", "paused")
      .eq("updated_at", revision)
      .select("id")
      .maybeSingle();
    if (startError) {
      throw startError;
    }
    if (!started) {
      throw new Error("broadcast_claim_lost");
    }
    return {
      success: true,
      broadcast_id: broadcastId,
      recipients: recipients.total ?? recipients.count ?? "?",
    };
  } catch (error) {
    const { error: failed } = await db
      .from("broadcasts")
      .update({ status: "failed" })
      .eq("id", broadcastId)
      .eq("tenant_id", tenantId)
      .eq("status", "paused")
      .eq("updated_at", revision);
    if (failed) {
      console.error("[sendApprovedBroadcast] failed to close claim", failed);
    }
    throw error;
  }
}

/** Preserve the original enqueue response for the approval's HTTP error contract. */
export class BroadcastEnqueueError extends Error {
  constructor(public detail: Json) {
    super("enqueue_failed");
  }
}

/** Invoke enqueue with the claim revision, retaining JSON provider errors. */
export async function invokeBroadcastEnqueue(
  db: DbClient,
  broadcastId: string,
  claimRevision: string,
) {
  const { data, error } = await db.functions.invoke("broadcast-enqueue", {
    body: { broadcastId, dryRun: false, claimRevision },
  });
  if (error instanceof FunctionsHttpError) {
    const detail = await error.context.json().catch((parseError: unknown) => {
      console.error(
        "[broadcast-enqueue] invalid HTTP error response",
        parseError,
      );
      return {};
    });
    throw new BroadcastEnqueueError(detail);
  }
  if (error) {
    throw error;
  }
  return data;
}
