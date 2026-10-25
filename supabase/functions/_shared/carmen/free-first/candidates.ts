/**
 * Connected chat-model brains as router candidates, and HTTP failures as
 * failover kinds. Pure, so "נתב חכם" can be tested without a database.
 */
import type { BrainProfile } from "../brain-connections/types.ts";
import type { FailureKind } from "./failover.ts";
import type { ModelCandidate } from "./types.ts";

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

/** The failover kind for an HTTP status from a chat API (0 = timeout). */
export function failureKindFor(status: number): FailureKind {
  if (status === 0) return "timeout";
  if (status === 429) return "rate_limit";
  if (status === 402) return "quota";
  if (status === 401 || status === 403) return "authentication";
  if (status >= 500) return "provider_unavailable";
  return "invalid_request";
}
