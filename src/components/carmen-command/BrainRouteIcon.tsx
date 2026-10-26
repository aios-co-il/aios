import { Brain, Cpu, ExternalLink, Landmark } from "lucide-react";
import type { BrainRouteType } from "@/lib/agentChannelRouting";

export function RouteIcon({
  type,
  color,
}: {
  type: BrainRouteType;
  /** Model brains carry their profile color (route.config.color). */
  color?: string | null;
}) {
  if (type === "parliament")
    return (
      <Landmark className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />
    );
  if (type === "direct_channel")
    return (
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />
    );
  if (type === "model")
    return (
      <Cpu
        className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]"
        style={color ? { color } : undefined}
      />
    );
  return <Brain className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />;
}

/** The profile color a model brain stores on its route. */
export function routeColor(route?: {
  config?: Record<string, unknown>;
}): string | null {
  const c = route?.config?.color;
  return typeof c === "string" ? c : null;
}
