import { Plug } from "lucide-react";
import { AGENT_SPRITES, type AgentSeatKey } from "@/lib/agentSeats";
import type { RouteRow } from "./connectedAgentProfile";

export function ConnectedAgentAvatar({ route }: { route: RouteRow }) {
  const fallback = AGENT_SPRITES[route.slug as AgentSeatKey];
  const src = route.avatarUrl || fallback;
  return src ? (
    <img src={src} alt="" className="h-12 w-12 rounded-full object-cover" />
  ) : (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Plug className="h-5 w-5" />
    </span>
  );
}
