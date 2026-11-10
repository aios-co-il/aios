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
      <Icon
        className="h-3 w-3 text-brand-accent-600 dark:text-brand-accent-400"
        aria-hidden="true"
      />
      {CLIENT_CARD_SOURCE_LABELS[source]}
    </Badge>
  );
}

// Sources are told apart by icon and label; chip colors stay within the brand
// so white-label tenants and dark mode follow the theme.
const DEFAULT_CHIP = "border-brand-ink/15 bg-brand-ink/5 text-foreground";
const EMPHASIZED_CHIP =
  "border-brand-accent/30 bg-brand-accent/10 text-foreground";
const HIGHLIGHTED_CHIP =
  "border-brand-highlight/50 bg-brand-highlight/25 text-foreground";

const SOURCE_CHIP: Record<
  Exclude<ClientCardSource, "human">,
  { icon: LucideIcon; className: string; title: string }
> = {
  carmen: {
    icon: Bot,
    className: EMPHASIZED_CHIP,
    title: "נכתב אוטומטית על ידי כרמן",
  },
  carmen_confirmed: {
    icon: Bot,
    className: EMPHASIZED_CHIP,
    title: "כרמן רשמה את העדכון לבקשת איש הצוות",
  },
  system_send: {
    icon: Send,
    className: DEFAULT_CHIP,
    title: "נרשם אוטומטית אחרי שליחה מהמערכת",
  },
  group_digest: {
    icon: Users,
    className: DEFAULT_CHIP,
    title: "סיכום אוטומטי של קבוצת הוואטסאפ",
  },
  automation: {
    icon: Workflow,
    className: HIGHLIGHTED_CHIP,
    title: "נכתב על ידי אוטומציה",
  },
};
