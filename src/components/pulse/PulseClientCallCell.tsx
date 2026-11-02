import { Badge } from "@/components/ui/badge";
import {
  formatLastClientCall,
  type PulseSnapshotRow,
} from "@/lib/pulseDashboard";
import {
  CLIENT_CALL_STALE_DAYS,
  NO_RECENT_CLIENT_CALL_LABEL,
  NO_RECENT_CLIENT_CALL_TEXT,
  resolveNoRecentClientCall,
} from "../../../supabase/functions/_shared/pulse/client-call.ts";

/**
 * "שיחה אחרונה" cell of the raw client card. The no-call highlight is a contact
 * indicator kept apart from the campaign status (AIO-227); without a snapshot,
 * or without loaded call data, it claims nothing.
 */
export function PulseClientCallCell({
  pulse,
  onCallLog,
}: {
  pulse: PulseSnapshotRow | null;
  onCallLog: () => void;
}) {
  const lastCallAt = pulse?.last_client_call_at ?? null;
  const noRecentCall =
    resolveNoRecentClientCall(pulse?.last_client_call_at) === true;

  return (
    <div>
      <span className="text-muted-foreground">שיחה אחרונה: </span>
      <button
        type="button"
        className={`underline decoration-dotted underline-offset-2 hover:text-primary ${
          noRecentCall ? "font-medium text-amber-700" : ""
        }`}
        onClick={onCallLog}
        disabled={!pulse}
      >
        {formatLastClientCall({ last_client_call_at: lastCallAt })}
      </button>
      {noRecentCall && lastCallAt ? (
        <Badge
          variant="outline"
          className="ms-1 border-amber-300 bg-amber-100 text-[10px] text-amber-900"
          title={NO_RECENT_CLIENT_CALL_TEXT}
        >
          {`${NO_RECENT_CLIENT_CALL_LABEL} ב-${CLIENT_CALL_STALE_DAYS} יום`}
        </Badge>
      ) : null}
    </div>
  );
}
