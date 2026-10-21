export type Profile = {
  displayName?: string;
  persona?: string;
  instructions?: string;
  avatarPath?: string;
};
export type RouteRow = {
  id: string;
  slug: string;
  label: string;
  route_type: string;
  config: Record<string, any> | null;
  avatarUrl?: string;
};

export const CONNECTED_AGENT_PROFILES_KEY = "connected-agent-profiles";

export const readProfile = (config: RouteRow["config"]): Profile => {
  const p = config?.profile;
  if (!p || typeof p !== "object") return {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    displayName: str(p.displayName),
    persona: str(p.persona),
    instructions: str(p.instructions),
    avatarPath: str(p.avatarPath),
  };
};
