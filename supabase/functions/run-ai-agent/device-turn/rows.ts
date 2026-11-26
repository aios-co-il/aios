/**
 * run-ai-agent's statements on `carmen_device_actions`, all with the service role and all
 * keyed by the signed-in user and their org. Every state change is one guarded UPDATE that
 * names the state it leaves, so of two writers racing for a row (this server and the panel
 * completing it through carmen-device-action) only one finds it in that state.
 */
import {
  DEVICE_CARD_LIFE_MS,
  type DeviceToolName,
} from "../../_shared/carmen/device/contract.ts";
import type { Database } from "../../_shared/database.types.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";

export type DeviceDb = Pick<DbClient, "from">;

type ActionRow = Database["public"]["Tables"]["carmen_device_actions"]["Row"];

/** Whose steps: the signed-in user in the org they act in. */
export type Owner = { tenantId: string; userId: string };

/** One chat request's steps: the owner and the request's `run_id`. */
export type RunKey = Owner & { runId: string };

/** What the server reads of a step to resume a run from it or to close it. */
export type StepRow = Pick<
  ActionRow,
  | "id"
  | "tool"
  | "status"
  | "result"
  | "observed_origin"
  | "observed_path"
  | "expires_at"
  | "consumed_at"
>;

export const TABLE = "carmen_device_actions";
export const STEP_COLUMNS =
  "id, tool, status, result, observed_origin, observed_path, expires_at, consumed_at";

/** The run's steps in the order they were written: how many, and where each page was. */
export async function readRunSteps(
  db: DeviceDb,
  run: RunKey,
): Promise<Array<{ observed_origin: string | null }>> {
  const { data, error } = await db
    .from(TABLE)
    .select("id, observed_origin, created_at")
    .eq("tenant_id", run.tenantId)
    .eq("user_id", run.userId)
    .eq("run_id", run.runId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`reading the run's device steps failed: ${error.message}`);
  }
  return data ?? [];
}

/** Writes a pending step that lives for the card's life; its id. */
export async function insertStep(
  db: DeviceDb,
  step: RunKey & { conversationId: string; tool: DeviceToolName; now: Date },
): Promise<string> {
  const { data, error } = await db
    .from(TABLE)
    .insert({
      tenant_id: step.tenantId,
      user_id: step.userId,
      run_id: step.runId,
      conversation_id: step.conversationId,
      tool: step.tool,
      arguments: {},
      status: "pending",
      expires_at: new Date(
        step.now.getTime() + DEVICE_CARD_LIFE_MS,
      ).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`writing the device step failed: ${error?.message}`);
  }
  return data.id;
}

/** The step a continuation names, when it is this run's, in this conversation, of this owner. */
export async function readStep(
  db: DeviceDb,
  run: RunKey & { conversationId: string; actionId: string },
): Promise<StepRow | null> {
  const { data, error } = await db
    .from(TABLE)
    .select(STEP_COLUMNS)
    .eq("id", run.actionId)
    .eq("tenant_id", run.tenantId)
    .eq("user_id", run.userId)
    .eq("run_id", run.runId)
    .eq("conversation_id", run.conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(`reading the device step failed: ${error.message}`);
  }
  return data;
}

/**
 * Marks a closed step used and clears its page text, once: false when another request
 * used it first or its state moved. A step whose result the server will not hand to the
 * model is closed as `refused` in the same write.
 */
export async function consumeStep(
  db: DeviceDb,
  owner: Owner,
  step: Pick<StepRow, "id" | "status">,
  refuse: boolean,
  now: Date,
): Promise<boolean> {
  const { data, error } = await db
    .from(TABLE)
    .update({
      consumed_at: now.toISOString(),
      result: null,
      ...(refuse ? { status: "refused", decision: "never" } : {}),
    })
    .eq("id", step.id)
    .eq("tenant_id", owner.tenantId)
    .eq("user_id", owner.userId)
    .eq("status", step.status)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`using the device step failed: ${error.message}`);
  }
  return data !== null;
}
