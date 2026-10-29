import type { DbClient } from "../_shared/supabase-clients.ts";
import type { Tables } from "../_shared/database.types.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import {
  authorizeApprovalActor,
  claimApprovalRow,
} from "../_shared/carmen/approvals/approver.ts";

/** The reviewer once the decision is theirs to make, or the refusal to send back. */
export type RunDecisionGate =
  | { ok: true; reviewerId: string | null }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Who decides this run step: the tenant and role gate first, so other tenants only
 * ever see 404, then a one-time pending → approved/rejected claim.
 */
export async function authorizeRunDecision(
  supabase: Pick<DbClient, "from">,
  auth: { kind: "user" | "service"; userId: string | null },
  approval: Tables<"agent_approval_queue">,
  decision: "approved" | "rejected",
  bodyReviewerId: unknown,
): Promise<RunDecisionGate> {
  // A signed-in caller decides as themselves; only service callers name the reviewer.
  const reviewerId =
    auth.kind === "user" ? auth.userId : asUuidOrNull(bodyReviewerId);
  const authz = await authorizeApprovalActor(
    supabase,
    approval,
    reviewerId,
    decision === "rejected" ? "reject" : "execute",
  );
  if (!authz.ok) {
    return {
      ok: false,
      status: authz.status,
      body: { ok: false, error: authz.error },
    };
  }

  // Carmen approvals have no run; carmen-approval-execute runs them and checks the approver.
  if (!approval.run_id) {
    return {
      ok: false,
      status: 409,
      body: { ok: false, error: "use_carmen_approval_execute" },
    };
  }

  const claimed =
    approval.status === "pending"
      ? await claimApprovalRow(supabase, approval, reviewerId, {
          from: ["pending"],
          to: decision,
        })
      : null;
  if (!claimed) {
    return {
      ok: false,
      status: 409,
      body: {
        ok: false,
        error: "approval already decided",
        status: approval.status,
      },
    };
  }

  return { ok: true, reviewerId };
}
