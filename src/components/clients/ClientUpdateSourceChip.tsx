import { Bot, Send, Users, Workflow, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CLIENT_CARD_SOURCE_LABELS,
  isClientCardSource,
  type ClientCardSource,
} from "../../../supabase/functions/_shared/client-card/sources.ts";

/** Marks a client card entry that no person typed. Human entries get no chip. */
export function ClientUpdateSourceChip({ source }: { source?: string | null }) {
  if (!isClientCardSource(source) || source === "human") {
    return null;
  }
  const chip = SOURCE_CHIP[source];
  const Icon = chip.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-xs ${chip.className}`}
      title={chip.title}
      data-testid="client-update-source-chip"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {CLIENT_CARD_SOURCE_LABELS[source]}
    </Badge>
  );
}

const SOURCE_CHIP: Record<
  Exclude<ClientCardSource, "human">,
  { icon: LucideIcon; className: string; title: string }
> = {
  carmen: {
    icon: Bot,
    className: "border-violet-200 bg-violet-50 text-violet-700",
    title: "נכתב אוטומטית על ידי כרמן",
  },
  carmen_confirmed: {
    icon: Bot,
    className: "border-violet-200 bg-violet-50 text-violet-700",
    title: "כרמן רשמה את העדכון לבקשת איש הצוות",
  },
  system_send: {
    icon: Send,
    className: "border-sky-200 bg-sky-50 text-sky-700",
    title: "נרשם אוטומטית אחרי שליחה מהמערכת",
  },
  group_digest: {
    icon: Users,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    title: "סיכום אוטומטי של קבוצת הוואטסאפ",
  },
  automation: {
    icon: Workflow,
    className: "border-amber-200 bg-amber-50 text-amber-700",
    title: "נכתב על ידי אוטומציה",
  },
};
