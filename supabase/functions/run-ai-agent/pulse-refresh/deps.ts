import type { RefreshClient } from "./refresh-client.ts";
import type { PulseRefreshDeps } from "./run.ts";
import type { PulseRefreshRequestBody, SnapshotResponse } from "./snapshot.ts";

/** How long a chat turn waits for campaign-pulse-snapshot. */
const PULSE_REFRESH_TIMEOUT_MS = 120_000;

/** Where and how the refresh calls campaign-pulse-snapshot. */
type SnapshotEndpoint = {
  supabaseUrl?: string | null;
  serviceKey?: string | null;
  fetchImpl: typeof fetch;
  timeoutMs: number;
};

/** run-ai-agent's context for the Supabase-backed deps. */
export type PulseRefreshDepsOptions = {
  supabase: RefreshClient;
  tenantId: string;
  accessibleTenantIds?: string[];
  assertCallerCanAccessClient?: (clientId: string) => Promise<unknown>;
  requestedBy?: string | null;
  supabaseUrl?: string | null;
  serviceKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Supabase-backed deps for run-ai-agent; loadPulse comes from the caller. */
export function createPulseRefreshDeps({
  supabase,
  tenantId,
  accessibleTenantIds = [tenantId],
  assertCallerCanAccessClient,
  requestedBy = null,
  supabaseUrl,
  serviceKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = PULSE_REFRESH_TIMEOUT_MS,
}: PulseRefreshDepsOptions): Omit<PulseRefreshDeps, "loadPulse"> {
  return {
    now: () => new Date(),
    assertClientVisible: (clientId) =>
      assertClientVisible(supabase, clientId, {
        accessibleTenantIds,
        assertCallerCanAccessClient,
      }),
    latestCalculatedAt: () => latestCalculatedAt(supabase, tenantId),
    claimRefresh: (minIntervalSeconds) =>
      claimRefresh(supabase, {
        tenantId,
        minIntervalSeconds,
        requestedBy,
      }),
    invokeSnapshot: (body) =>
      postSnapshot({ supabaseUrl, serviceKey, fetchImpl, timeoutMs }, body),
  };
}

/**
 * The client must sit in a tenant the caller can open; managers then pass
 * assertCallerCanAccessClient, campaigners only for their own clients.
 */
async function assertClientVisible(
  supabase: RefreshClient,
  clientId: string,
  scope: {
    accessibleTenantIds: string[];
    assertCallerCanAccessClient?: (clientId: string) => Promise<unknown>;
  },
): Promise<void> {
  const { data: client, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .in("tenant_id", scope.accessibleTenantIds)
    .maybeSingle();
  if (error) {
    console.error("[refresh_campaign_pulse] client lookup failed", error);
    throw new Error("לא ניתן לבדוק הרשאה ללקוח");
  }
  if (!client) {
    throw new Error("הלקוח לא נמצא או מחוץ להרשאה שלך");
  }
  if (typeof scope.assertCallerCanAccessClient !== "function") {
    throw new Error("לא ניתן לבדוק הרשאה ללקוח");
  }
  await scope.assertCallerCanAccessClient(clientId);
}

/** Newest calculated_at of the tenant's pulse snapshots, or null. */
async function latestCalculatedAt(
  supabase: RefreshClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("campaign_pulse_snapshots")
    .select("calculated_at")
    .eq("tenant_id", tenantId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.calculated_at ?? null;
}

/** claim_campaign_pulse_refresh: true when this call may refresh now. */
async function claimRefresh(
  supabase: RefreshClient,
  claim: {
    tenantId: string;
    minIntervalSeconds: number;
    requestedBy: string | null;
  },
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_campaign_pulse_refresh", {
    p_tenant_id: claim.tenantId,
    p_min_interval_seconds: claim.minIntervalSeconds,
    // The argument defaults to NULL, so an unknown caller omits it.
    p_requested_by: claim.requestedBy ?? undefined,
  });
  if (error) {
    throw error;
  }
  return data === true;
}

/** POSTs the body to campaign-pulse-snapshot as the service role; aborts after timeoutMs. */
async function postSnapshot(
  { supabaseUrl, serviceKey, fetchImpl, timeoutMs }: SnapshotEndpoint,
  body: PulseRefreshRequestBody,
): Promise<SnapshotResponse> {
  if (!supabaseUrl || !serviceKey) {
    throw new Error("campaign-pulse-snapshot is not configured");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/campaign-pulse-snapshot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    return {
      ok: response.ok,
      status: response.status,
      body: await jsonOrNull(response),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The response body as JSON, or null when it is not JSON. */
async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
