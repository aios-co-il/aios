import type { AgentProfile } from "@/lib/carmenAgentProfile";

export { readAgentProfile as readProfile } from "@/lib/carmenAgentProfile";
export type Profile = AgentProfile;

/** A connected agent's brain route, with its signed avatar URL. */
export type RouteRow = {
  id: string;
  slug: string;
  label: string;
  route_type: string;
  config: Record<string, unknown> | null;
  avatarUrl?: string;
};

export const CONNECTED_AGENT_PROFILES_KEY = "connected-agent-profiles";
