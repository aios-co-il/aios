import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { refusalLabel, refusalStatusLabel } from "./clientAutoSendLabels";
import {
  REFUSALS_WINDOW_DAYS,
  useClientSendRefusals,
} from "./useClientSendRefusals";

/**
 * The automatic sends to this client that the guard blocked, or only logged
 * while their rule is observed, one line per reason and status with how many
 * and the newest, so a manager sees what to allow before the rule starts
 * blocking. Hidden while there are none.
 */
export function RecentClientSendRefusals({ clientId }: { clientId: string }) {
  const refusals = useClientSendRefusals(clientId);
  if (refusals.isError) {
    return (
      <p className="text-xs text-destructive">טעינת השליחות שנחסמו נכשלה</p>
    );
  }
  if (!refusals.data?.length) {
    return null;
  }
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-medium">
        {`שליחות אוטומטיות שנחסמו (${REFUSALS_WINDOW_DAYS} יום)`}
      </h4>
      <ul className="divide-y rounded-lg border">
        {refusals.data.map((group) => (
          <li
            key={`${group.enforced}:${group.reason}`}
            className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs"
          >
            <span>
              {refusalLabel(group.reason)}
              {group.count > 1 && (
                <span className="text-muted-foreground">{` · ${group.count} פעמים`}</span>
              )}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Badge variant={group.enforced ? "destructive" : "secondary"}>
                {refusalStatusLabel(group.enforced)}
              </Badge>
              <time dateTime={group.latest}>
                {format(new Date(group.latest), "d/M/yy HH:mm")}
              </time>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
