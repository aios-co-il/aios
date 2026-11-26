/**
 * carmen-device-action (AIO-667): the extension's panel, with the user's own session,
 * claims the device action it was handed the id of and later completes it.
 *
 * claim: pending becomes claimed once, for the action's own user in an org they belong to,
 * before it expires, on a run the user has not stopped. Only then does the panel learn
 * the arguments (and the server's facts about the step, claim-reply.ts), which no browser can read from the table, so the id that travels through
 * the framed site carries nothing to act on. When the stop cannot be read the claim fails
 * closed: nothing is handed over and the action stays `claimed`, so it cannot be claimed
 * again. A click or a type also learns the origin it may run on without a card (trust.ts).
 * complete: claimed becomes the status the panel reports, once, by the same user; a click
 * or a type the user ran after ticking "trust this site" on its card records that trust
 * for the action's conversation (AIO-656).
 *
 * Every refusal about a row is the same answer, whatever the reason, so a caller learns
 * nothing about a row that is not theirs to take. The reason goes to the log with the
 * action's id and never with its content. A claimed action that no panel completes stays
 * `claimed`: this function never writes `outcome_unknown`; the server decides that when
 * the turn continues or the next one starts.
 */
import { isDeviceToolName } from "../_shared/carmen/device/contract.ts";
import { readRunStopped } from "../_shared/carmen/run-stop.ts";
import { corsHeaders } from "../_shared/cors.ts";
import type { requireAuth } from "../_shared/security.ts";
import type { ActionReport } from "./report.ts";
import { parseRequest } from "./request.ts";
import { toolResult } from "../_shared/carmen/device-result-check.ts";
import {
  type ActionDb,
  cancelClaimedAction,
  claimAction,
  completeAction,
  type OwnAction,
  readOwnAction,
} from "./rows.ts";
import { claimReply } from "./claim-reply.ts";
import { recordCardTrust } from "./trust-record.ts";

export type DeviceActionDeps = {
  /** Who sent the request, as `requireAuth` reads it. */
  caller: typeof requireAuth;
  /** A client that reads as the caller, under row-level security. */
  userDb: (authorization: string) => ActionDb;
  /** The service-role client the guarded writes use. */
  serviceDb: () => ActionDb;
  now: () => Date;
};

/** A full read-page result is about half of this; anything longer is not a panel's request. */
export const REQUEST_CHARS_MAX = 200_000;

/** The response to one request. */
export async function handleDeviceAction(
  req: Request,
  deps: DeviceActionDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }
  // The service key carries no user id, so it is nobody here: only a person's own session claims or completes.
  const userId = (await deps.caller(req))?.userId;
  if (!userId) {
    return reply({ error: "unauthorized" }, 401);
  }
  const request = parseRequest(await readBody(req));
  if (!request) {
    console.warn(`[carmen-device-action] invalid request from user=${userId}`);
    return reply({ error: "invalid_request" }, 400);
  }

  try {
    const userDb = deps.userDb(req.headers.get("Authorization") ?? "");
    const action = await readOwnAction(userDb, request.id);
    if (!action || action.user_id !== userId) {
      return refused(request.action, request.id, "not the caller's row");
    }
    return request.action === "claim"
      ? await claim(action, deps)
      : await complete(action, request.report, deps);
  } catch (error) {
    console.error(
      `[carmen-device-action] ${request.action} of action=${request.id} failed`,
      error,
    );
    return reply({ error: "failed" }, 500);
  }
}

/** Hands the action to the panel: its tool and arguments, once. */
async function claim(
  action: OwnAction,
  deps: DeviceActionDeps,
): Promise<Response> {
  if (!isDeviceToolName(action.tool)) {
    return refused("claim", action.id, `unknown tool ${action.tool}`);
  }
  const serviceDb = deps.serviceDb();
  const claimed = await claimAction(serviceDb, action, deps.now());
  if (!claimed) {
    return refused("claim", action.id, "not pending or expired");
  }

  // Read after the claim, so a stop recorded any time before it is seen. A failed read
  // throws: the tool and arguments are handed over only when the run is known not stopped.
  if (await readRunStopped(serviceDb, action.run_id, action.user_id)) {
    await cancelClaimedAction(serviceDb, action, deps.now());
    return refused("claim", action.id, "run stopped");
  }

  const tool = action.tool;
  return reply(
    await claimReply(serviceDb, { ...action, tool }, claimed.arguments),
  );
}

/** Stores what the panel reports about the action it claimed. */
async function complete(
  action: OwnAction,
  report: ActionReport,
  deps: DeviceActionDeps,
): Promise<Response> {
  const result =
    report.status === "done"
      ? toolResult(action.tool, report.result, action.user_id)
      : null;
  if (report.status === "done" && !result) {
    console.warn(
      `[carmen-device-action] complete of action=${action.id} refused: the result does not fit ${action.tool}`,
    );
    return reply({ error: "invalid_result" }, 400);
  }

  const serviceDb = deps.serviceDb();
  const completed = await completeAction(
    serviceDb,
    action,
    { ...report, result },
    deps.now(),
  );
  if (completed && report.trust_origin) {
    await recordCardTrust(serviceDb, action, report.trust_origin);
  }
  return completed
    ? reply({ ok: true })
    : refused("complete", action.id, "not claimed or already completed");
}

/** The body as JSON, or null when it is too long or not JSON. */
async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > REQUEST_CHARS_MAX) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The one answer to every refusal about a row; the reason is logged, never returned. */
function refused(action: string, id: string, reason: string): Response {
  console.warn(
    `[carmen-device-action] ${action} of action=${id} refused: ${reason}`,
  );
  return reply({ error: "not_available" }, 404);
}

/** A JSON response with CORS headers. */
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
