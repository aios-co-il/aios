/**
 * Connected chat-model brains as router candidates, and HTTP failures as
 * failover kinds. Pure, so "נתב חכם" can be tested without a database.
 */
import type { BrainProfile } from "../brain-connections/types.ts";
import type { FailureKind } from "./failover.ts";
import type { ModelCandidate, TaskDescriptor, TaskKind } from "./types.ts";

/** Pure writing tasks a model without Carmen's tools or data can answer. */
const FREE_MODEL_KINDS = new Set<TaskKind>(["content_draft", "customer_reply"]);

/**
 * True when "נתב חכם" must hand the message to Carmen's own brain: it needs
 * tools, an approval or vision, or it is not a recognised writing task. An
 * unrecognised message ("pulse check for clients") usually means Carmen's
 * data, so it never goes to a model that would answer without it.
 */
export function needsCarmenBrain(task: TaskDescriptor): boolean {
  return (
    !!task.needsToolCalling ||
    !!task.requiresActionApproval ||
    !!task.needsVision ||
    !FREE_MODEL_KINDS.has(task.kind)
  );
}

export type RoutableConnection = {
  id: string;
  provider_preset: string | null;
  profile: BrainProfile;
  key_last4: string | null;
};

/**
 * Model brains have no tools or vision; a brain without a key is skipped.
 * Earlier connections come first within a tier.
 */
export function candidatesFromConnections(
  conns: RoutableConnection[],
): ModelCandidate[] {
  return conns
    .filter((c) => !!c.key_last4)
    .map((c, i) => ({
      id: c.id,
      provider: c.provider_preset ?? "custom",
      tier: c.profile.tier === "free" ? "free" : "premium",
      enabled: true,
      healthy: true,
      quotaAvailable: true,
      supportsTools: false,
      supportsVision: false,
      approvedForClientData: c.profile.client_data_ok === true,
      priority: i,
    }));
}

/** A model brain's row in agent_brain_routes. */
export type ModelRouteRow = {
  slug: string;
  connection_id: string | null;
  active: boolean | null;
};

/**
 * Connections the user could pick themselves: the brain is shown in the picker
 * (switch on) and the user holds a grant for its slug.
 */
export function pickableConnections<T extends { id: string }>(
  conns: T[],
  routes: ModelRouteRow[],
  allowed: (slug: string) => boolean,
): T[] {
  const ok = new Set(
    routes
      .filter((r) => r.connection_id && r.active === true && allowed(r.slug))
      .map((r) => r.connection_id),
  );
  return conns.filter((c) => ok.has(c.id));
}

/** The failover kind for an HTTP status from a chat API (0 = timeout). */
export function failureKindFor(status: number): FailureKind {
  if (status === 0) return "timeout";
  if (status === 429) return "rate_limit";
  if (status === 402) return "quota";
  if (status === 401 || status === 403) return "authentication";
  if (status >= 500) return "provider_unavailable";
  return "invalid_request";
}
