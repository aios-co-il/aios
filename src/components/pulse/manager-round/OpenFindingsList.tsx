import { Badge } from "@/components/ui/badge";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  FINDING_KIND_LABELS_HE,
  isFindingKind,
} from "../../../../supabase/functions/_shared/manager-round/kinds.ts";
import { useOpenFindings } from "./useOpenFindings";

/** Read-only list of the tenant's open findings, for owners reviewing observe mode. */
export function OpenFindingsList() {
  const { tenantId } = useCurrentTenant();
  const { data, isLoading, isError } = useOpenFindings(tenantId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">טוען ממצאים…</p>;
  }
  if (isError) {
    return (
      <p className="text-xs text-destructive">לא הצלחנו לטעון את הממצאים.</p>
    );
  }
  if (!data?.length) {
    return <p className="text-xs text-muted-foreground">אין ממצאים פתוחים.</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">ממצאים פתוחים ({data.length})</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
        {data.map((finding) => (
          <li key={finding.id} className="flex items-start gap-2">
            <span className="font-mono text-muted-foreground">
              #{finding.short_code}
            </span>
            <span className="flex-1">{finding.summary_he}</span>
            <Badge
              variant={
                finding.severity === "critical" ? "destructive" : "secondary"
              }
            >
              {isFindingKind(finding.kind)
                ? FINDING_KIND_LABELS_HE[finding.kind]
                : finding.kind}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
