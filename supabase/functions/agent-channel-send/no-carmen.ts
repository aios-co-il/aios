// What agent-channel-send answers for a tenant with no active Carmen agent.
// Carmen's chat bar loads its brains and channel health on every page, so for
// such a tenant those reads must answer "nothing to show", not fail with 400.

/** A status and JSON body for the function to send. */
export interface ChannelReply {
  status: number;
  body: Record<string, unknown>;
}

/**
 * list_routes: no brains, restricted, so the chat bar shows "no brain access"
 * and selects none. channel_health: not ok, without seats, so no banner. Any
 * other action needs Carmen and stays a 400.
 */
export function noCarmenReply(action: string): ChannelReply {
  if (action === "list_routes") {
    return {
      status: 200,
      body: { ok: true, routes: [], restricted: true, no_carmen: true },
    };
  }
  if (action === "channel_health") {
    return { status: 200, body: { ok: false, no_carmen: true } };
  }
  return {
    status: 400,
    body: { error: "No Carmen agent for this tenant", no_carmen: true },
  };
}
