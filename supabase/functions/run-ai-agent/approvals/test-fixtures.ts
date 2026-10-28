// Shared rows and callers for the approvals picker tests.
import type { PickRow } from "./types.ts";

export const NOW = Date.parse("2026-10-26T12:00:00Z");
export const DAVID = "11111111-1111-4111-8111-111111111111";
export const DANA = "22222222-2222-4222-8222-222222222222";
export const CONV = "conv:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const ID1 = "a1b2c3d4-0000-4000-8000-000000000001";
export const ID2 = "b2c3d4e5-0000-4000-8000-000000000002";
export const ID3 = "c3d4e5f6-0000-4000-8000-000000000003";

/** An owner replying in CONV at NOW. */
export const owner = {
  userId: DAVID,
  roles: ["owner"],
  conversationKey: CONV,
  nowMs: NOW,
};

/** ISO time `m` minutes before NOW. */
export function minutesAgo(m: number): string {
  return new Date(NOW - m * 60_000).toISOString();
}

/** A pending fb_pause row David requested in CONV five minutes ago. */
export function row(id: string, over: Partial<PickRow> = {}): PickRow {
  return {
    id,
    status: "pending",
    tool_name: "fb_pause",
    action_type: "fb_pause",
    title: `בקשה ${id.slice(0, 4)}`,
    description: null,
    tool_input: null,
    requested_by: DAVID,
    created_at: minutesAgo(5),
    expires_at: inHours(23),
    run_id: null,
    context: { conversation_key: CONV },
    ...over,
  };
}

/** ISO time `h` hours after NOW. */
function inHours(h: number): string {
  return new Date(NOW + h * 3_600_000).toISOString();
}
