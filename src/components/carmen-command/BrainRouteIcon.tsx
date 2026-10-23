import { Brain, ExternalLink, Landmark } from "lucide-react";
import type { BrainRouteType } from "@/lib/agentChannelRouting";

export function RouteIcon({ type }: { type: BrainRouteType }) {
  if (type === "parliament")
    return (
      <Landmark className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />
    );
  if (type === "direct_channel")
    return (
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />
    );
  return <Brain className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />;
}
