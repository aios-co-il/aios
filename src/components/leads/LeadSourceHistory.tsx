import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useLeadSourceEvents } from "@/hooks/useLeadSourceEvents";
import { leadSourceDisplay } from "@/lib/leadFields";

/** Every arrival that named a source, newest first, each with its date. */
export function LeadSourceHistory({ leadId }: { leadId: string }) {
  const { data: events = [] } = useLeadSourceEvents(leadId);

  // One arrival is already shown as the lead's source.
  if (events.length < 2) return null;

  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">
        :היסטוריית מקורות הגעה
      </div>
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center justify-end gap-2 text-sm"
        >
          {event.campaign_name && (
            <span className="text-muted-foreground truncate">
              {event.campaign_name} ·
            </span>
          )}
          <span className="font-medium">
            {leadSourceDisplay({ source: event.source })}
          </span>
          <span className="text-muted-foreground">
            {format(new Date(event.received_at), "dd/MM/yyyy HH:mm", {
              locale: he,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
