// In-memory deps for the Deno tests of runCampaignPulseRefresh: a stale
// snapshot, a free claim and a snapshot call that refreshes 12 clients.
import type { PulseRefreshRefusal } from "./input.ts";
import type { PulsePayload } from "./result.ts";
import type { PulseRefreshDeps } from "./run.ts";
import type { PulseRefreshRequestBody } from "./snapshot.ts";

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
export const CLIENT = "33333333-3333-4333-8333-333333333333";
export const USER = "44444444-4444-4444-8444-444444444444";
export const NOW = new Date("2026-10-26T10:00:00Z"); // 12:00 in Israel

/** What the fake deps saw, in call order. */
type FakeCalls = {
  assert: string[];
  claim: number[];
  invoke: PulseRefreshRequestBody[];
  loadPulse: number;
  order: string[];
};

/** Deps that record every call; overrides replace single deps. */
export function fakeDeps(overrides: Partial<PulseRefreshDeps> = {}) {
  const calls: FakeCalls = {
    assert: [],
    claim: [],
    invoke: [],
    loadPulse: 0,
    order: [],
  };
  const deps: PulseRefreshDeps = {
    now: () => NOW,
    assertClientVisible: async (clientId) => {
      calls.assert.push(clientId);
      calls.order.push("assert");
    },
    latestCalculatedAt: async () => "2026-10-26T04:00:00Z",
    claimRefresh: async (seconds) => {
      calls.claim.push(seconds);
      calls.order.push("claim");
      return true;
    },
    invokeSnapshot: async (body) => {
      calls.invoke.push(body);
      calls.order.push("invoke");
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          results: [{ tenant_id: TENANT, clients: 12, sent: false }],
        },
      };
    },
    loadPulse: async () => {
      calls.loadPulse += 1;
      calls.order.push("loadPulse");
      return {
        data_source: "deterministic_campaign_pulse_cache",
        auto_refreshed: false,
        count: 12,
        freshness: "2026-10-26T10:00:00Z",
        whatsapp_digest: "🟢 12 תקינים",
        instructions_to_agent: "הנחיית הדופק",
      };
    },
    ...overrides,
  };
  return { deps, calls };
}

/** The `refresh` record of a tool result; empty for a refusal. */
export function refreshOf(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const refresh = result.refresh;
  return typeof refresh === "object" && refresh !== null ? { ...refresh } : {};
}

/** The pulse of a tool result; a refusal fails the test. */
export function pulseOf(
  result: PulseRefreshRefusal | PulsePayload,
): PulsePayload {
  if ("error" in result) {
    throw new Error(`expected a pulse, got ${JSON.stringify(result)}`);
  }
  return result;
}
