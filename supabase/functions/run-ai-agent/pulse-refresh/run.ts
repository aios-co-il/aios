import type { PulseRefreshStatus } from "./note.ts";
import {
  checkRefreshInput,
  type PulseRefreshInput,
  type PulseRefreshRefusal,
} from "./input.ts";
import {
  type PulsePayload,
  type RefreshRecord,
  withRefreshNote,
} from "./result.ts";
import {
  buildPulseRefreshRequestBody,
  decidePulseRefresh,
  interpretPulseSnapshotResponse,
  PULSE_REFRESH_MIN_INTERVAL_SECONDS,
  type PulseRefreshRequestBody,
  shortError,
  type SnapshotOutcome,
  type SnapshotResponse,
} from "./snapshot.ts";

/** What the refresh needs from the outside world. */
export type PulseRefreshDeps = {
  now: () => Date;
  /** Throws when the caller may not see the client. */
  assertClientVisible: (clientId: string) => Promise<void>;
  /** Newest calculated_at of the tenant's snapshots, or null. */
  latestCalculatedAt: () => Promise<string | null>;
  /** True when this call may refresh. */
  claimRefresh: (minIntervalSeconds: number) => Promise<boolean>;
  invokeSnapshot: (body: PulseRefreshRequestBody) => Promise<SnapshotResponse>;
  /** The get_latest_campaign_pulse result. */
  loadPulse: () => Promise<PulsePayload | null>;
};

/** Runs the refresh and returns the pulse like get_latest_campaign_pulse. */
export async function runCampaignPulseRefresh(
  input: PulseRefreshInput,
  deps: PulseRefreshDeps,
): Promise<PulseRefreshRefusal | PulsePayload> {
  const checked = await checkRefreshInput(input, deps.assertClientVisible);
  if ("error" in checked) {
    console.warn(
      "[refresh_campaign_pulse] refused",
      input.tenantId,
      input.surface,
      checked.error,
      checked.message,
    );
    return checked;
  }
  const now = deps.now();
  const refresh = await refreshIfStale(checked.tenantId, deps, now);
  const pulse = (await deps.loadPulse()) || {};
  return withRefreshNote(pulse, refresh, now);
}

/** Recomputes the snapshot unless it is fresh or another caller holds the claim. */
async function refreshIfStale(
  tenantId: string,
  deps: PulseRefreshDeps,
  now: Date,
): Promise<RefreshRecord> {
  const previousCalculatedAt = await storedCalculatedAt(tenantId, deps);
  const refresh: RefreshRecord = {
    status: "fresh_snapshot",
    previous_calculated_at: previousCalculatedAt,
    min_interval_minutes: Math.round(PULSE_REFRESH_MIN_INTERVAL_SECONDS / 60),
  };
  const decision = decidePulseRefresh({
    lastCalculatedAt: previousCalculatedAt,
    now,
  });
  if (!decision.refresh) {
    return refresh;
  }
  refresh.status = await claimStatus(tenantId, deps);
  if (refresh.status === "refreshed") {
    Object.assign(refresh, await runSnapshot(tenantId, deps));
  }
  return refresh;
}

/** The tenant's newest snapshot time; a failed lookup counts as none. */
async function storedCalculatedAt(
  tenantId: string,
  deps: PulseRefreshDeps,
): Promise<string | null> {
  try {
    return await deps.latestCalculatedAt();
  } catch (error) {
    // The claim still limits the rate.
    console.warn(
      "[refresh_campaign_pulse] latest snapshot lookup failed",
      tenantId,
      error,
    );
    return null;
  }
}

/** Takes the per-tenant claim; fails closed, since without it there is no rate limit. */
async function claimStatus(
  tenantId: string,
  deps: PulseRefreshDeps,
): Promise<
  Extract<
    PulseRefreshStatus,
    "refreshed" | "rate_limited" | "rate_limit_unavailable"
  >
> {
  try {
    const claimed = await deps.claimRefresh(PULSE_REFRESH_MIN_INTERVAL_SECONDS);
    return claimed === true ? "refreshed" : "rate_limited";
  } catch (error) {
    console.warn(
      "[refresh_campaign_pulse] refresh claim failed",
      tenantId,
      error,
    );
    return "rate_limit_unavailable";
  }
}

/** Calls campaign-pulse-snapshot for the tenant and reads its answer. */
async function runSnapshot(
  tenantId: string,
  deps: PulseRefreshDeps,
): Promise<
  | SnapshotOutcome
  | {
      status: Extract<PulseRefreshStatus, "refresh_timeout" | "refresh_failed">;
      error: string;
    }
> {
  try {
    const response = await deps.invokeSnapshot(
      buildPulseRefreshRequestBody(tenantId),
    );
    return interpretPulseSnapshotResponse(tenantId, response);
  } catch (error) {
    console.error(
      "[refresh_campaign_pulse] snapshot call failed",
      tenantId,
      error,
    );
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      status: aborted ? "refresh_timeout" : "refresh_failed",
      error: shortError((error instanceof Error && error.message) || error),
    };
  }
}
