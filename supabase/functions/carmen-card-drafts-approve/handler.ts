/**
 * Approves client-card drafts from the card-drafts page: a signed-in person
 * names up to CARD_DRAFTS_APPROVE_MAX card_stale_group findings, and each one
 * they may see is written on the client card and closed as their approval,
 * exactly as their "אשר <code>" reply to Carmen would
 * (run-ai-agent/card-draft-approval/approve.ts), reported contact included.
 *
 * Who may approve is the database's rule, not this function's: the findings
 * are read as the caller, so the carmen_findings RLS (carmen_finding_role_of,
 * the rule "אשר" applies) decides which ones exist for them. An id they
 * cannot see is reported not_found and never written. Only the rows read
 * that way, within the requested tenant, reach the service-role write.
 */
import { ClientCardEntryError } from "../_shared/client-card/entry-types.ts";
import { corsHeaders } from "../_shared/cors.ts";
import type { Tables } from "../_shared/database.types.ts";
import { cardDraftOf } from "../_shared/manager-round/card-draft.ts";
import {
  type CardDraftWritePorts,
  writeCardDraft,
} from "../_shared/manager-round/card-draft-write.ts";
import type {
  CardDraftApproveResult,
  CardDraftsApproveResponse,
} from "../_shared/manager-round/card-drafts-approve.ts";
import { type ApproveRequest, parseApproveRequest } from "./request.ts";

export type DraftFinding = Pick<
  Tables<"carmen_findings">,
  "id" | "client_id" | "short_code" | "evidence"
>;

export type ApproveDeps = {
  /** The caller's user id, or null when the token is not a signed-in user. */
  userId: (authorization: string) => Promise<string | null>;
  /**
   * The requested live card_stale_group findings of the tenant, read as the
   * caller so RLS leaves out the ones they may not see.
   */
  visibleDrafts: (
    authorization: string,
    request: ApproveRequest,
  ) => Promise<Array<DraftFinding>>;
  /** The card write and the finding's closing, over the service-role client. */
  write: CardDraftWritePorts;
};

/** The response to one request. */
export async function handleApprove(
  req: Request,
  deps: ApproveDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }
  const authorization = req.headers.get("Authorization") ?? "";
  const userId = authorization.startsWith("Bearer ")
    ? await deps.userId(authorization)
    : null;
  if (!userId) {
    return reply({ error: "unauthorized" }, 401);
  }
  const parsed = parseApproveRequest(await req.json().catch(() => null));
  if (!parsed.ok) {
    console.warn(`[carmen-card-drafts-approve] refused: ${parsed.error}`);
    return reply({ error: parsed.error }, 400);
  }
  const visible = await readVisible(deps, authorization, parsed.request);
  if (!visible) {
    return reply({ error: "read_failed" }, 502);
  }
  const response: CardDraftsApproveResponse = {
    results: await approveAll(deps, parsed.request, visible, userId),
  };
  return reply(response);
}

/** The findings the caller may approve; null (logged) when the read failed. */
async function readVisible(
  deps: ApproveDeps,
  authorization: string,
  request: ApproveRequest,
): Promise<Array<DraftFinding> | null> {
  try {
    return await deps.visibleDrafts(authorization, request);
  } catch (error) {
    console.error(
      `[carmen-card-drafts-approve] reading drafts of ${request.tenantId} failed`,
      error,
    );
    return null;
  }
}

/**
 * One result per requested id, in request order. Writes run one at a time:
 * each is a few card RPCs, and one failure must not stop the rest.
 */
async function approveAll(
  deps: ApproveDeps,
  request: ApproveRequest,
  visible: Array<DraftFinding>,
  userId: string,
): Promise<Array<CardDraftApproveResult>> {
  const byId = new Map(visible.map((finding) => [finding.id, finding]));
  const results: Array<CardDraftApproveResult> = [];
  for (const id of request.findingIds) {
    const finding = byId.get(id);
    results.push(
      finding
        ? await approveOne(deps, request.tenantId, finding, userId)
        : { id, status: "not_found" },
    );
  }
  return results;
}

/** Writes one finding's draft as the person's approval. */
async function approveOne(
  deps: ApproveDeps,
  tenantId: string,
  finding: DraftFinding,
  userId: string,
): Promise<CardDraftApproveResult> {
  const draft = cardDraftOf(finding.evidence);
  const clientId = finding.client_id;
  if (!draft || !clientId) {
    return { id: finding.id, status: "no_draft" };
  }
  try {
    await writeCardDraft(deps.write, {
      tenantId,
      finding: {
        id: finding.id,
        short_code: finding.short_code,
        client_id: clientId,
      },
      draft,
      approvedBy: userId,
    });
    return { id: finding.id, status: "approved" };
  } catch (error) {
    if (error instanceof ClientCardEntryError) {
      console.warn(
        `[carmen-card-drafts-approve] card refused ${finding.id}: ${error.code}`,
      );
      return { id: finding.id, status: "error", code: error.code };
    }
    console.error(
      `[carmen-card-drafts-approve] writing ${finding.id} in ${tenantId} failed`,
      error,
    );
    return { id: finding.id, status: "error" };
  }
}

/** A JSON response with CORS headers. */
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
