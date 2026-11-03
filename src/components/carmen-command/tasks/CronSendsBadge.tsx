import { Badge } from "@/components/ui/badge";
import { CRON_SENDS_LABEL, type CronJobMeta } from "@/lib/cronJobsCatalog";

/** Sends to people: shown as a warning colour, so a WhatsApp job stands out. */
const SENDS_TO_PEOPLE = new Set(["whatsapp", "email", "whatsapp_email"]);

/** What a scheduled job sends (WhatsApp, email, dashboard only…), with its note as a tooltip. */
export function CronSendsBadge({ meta }: { meta: CronJobMeta }) {
  const loud = SENDS_TO_PEOPLE.has(meta.sends);
  return (
    <Badge
      variant="outline"
      title={meta.sendsNote}
      className={`text-[10px] ${loud ? "border-amber-300 bg-amber-50 text-amber-800" : "text-muted-foreground"}`}
    >
      {CRON_SENDS_LABEL[meta.sends]}
      {meta.sendsNote ? " *" : ""}
    </Badge>
  );
}
