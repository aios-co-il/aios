import { Loader2 } from "lucide-react";
import { billingNoteForRoute } from "@/lib/agentChannelRouting";
import { statusLabel } from "./brainRouteStatus";

interface BrainRouteNoteProps {
  provider?: string | null;
  status?: string | null;
  externalUrl?: string | null;
}

/** Billing/status line shown under the non-compact brain selector. */
export function BrainRouteNote({
  provider,
  status,
  externalUrl,
}: BrainRouteNoteProps) {
  const waiting = status === "waiting_external" || status === "debating";
  if (!(waiting || externalUrl || billingNoteForRoute(provider))) return null;
  return (
    <p className="px-1 text-[10px] leading-snug text-[var(--cc-text-dim)]">
      {billingNoteForRoute(provider)}
      {(waiting || externalUrl) && billingNoteForRoute(provider) ? " · " : null}
      {statusLabel(status)}
      {waiting && <Loader2 className="mr-1 inline h-2.5 w-2.5 animate-spin" />}
      {externalUrl && (
        <>
          {" · "}
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--cc-accent)] hover:underline"
          >
            סשן
          </a>
        </>
      )}
    </p>
  );
}
