import type { PulseRefreshRequestBody, SnapshotResponse } from "./snapshot.ts";

/** Where and how the refresh calls campaign-pulse-snapshot. */
export type SnapshotEndpoint = {
  supabaseUrl?: string | null;
  serviceKey?: string | null;
  fetchImpl: typeof fetch;
  timeoutMs: number;
};

/** POSTs the body to campaign-pulse-snapshot as the service role; aborts after timeoutMs. */
export async function postSnapshot(
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

/**
 * The response body as JSON, or null when it is not JSON. The parse failure
 * is logged; interpretPulseSnapshotResponse reads a null body as a failure.
 */
async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    console.warn(
      "[refresh_campaign_pulse] snapshot response is not JSON",
      response.status,
      error,
    );
    return null;
  }
}
