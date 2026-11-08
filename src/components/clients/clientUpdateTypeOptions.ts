import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarCheck,
  FileText,
  Flag,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Phone,
  StickyNote,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  CLIENT_UPDATE_TYPES,
  CLIENT_UPDATE_TYPE_LABELS,
  type ClientUpdateType,
} from "../../../supabase/functions/_shared/client-card/sources.ts";
import {
  SYSTEM_SEND_UPDATE_TYPES,
  type SystemSendUpdateType,
} from "../../../supabase/functions/_shared/client-card/send-kind.ts";
import { CARD_DRAFT_TYPES } from "../../../supabase/functions/_shared/manager-round/card-draft.ts";

const CLIENT_UPDATE_TYPE_ICONS: Record<ClientUpdateType, LucideIcon> = {
  call: Phone,
  weekly_update: CalendarCheck,
  general: StickyNote,
  red_flag: Flag,
};

/** The four card update types a person picks (AIO-516). */
export const CLIENT_UPDATE_TYPE_OPTIONS = CLIENT_UPDATE_TYPES.map((value) => ({
  value,
  label: CLIENT_UPDATE_TYPE_LABELS[value],
  icon: CLIENT_UPDATE_TYPE_ICONS[value],
}));

/** The composer's choices: the four types, then the SEO update, which opens its own form. */
export const INTERACTION_TYPES = [
  ...CLIENT_UPDATE_TYPE_OPTIONS,
  { value: "seo_update", label: "עדכון SEO", icon: AlertTriangle },
];

const SYSTEM_SEND_TYPE_ICONS: Record<SystemSendUpdateType, LucideIcon> = {
  report_sent: FileText,
  dashboard_shared: LayoutDashboard,
  meeting_summary_sent: Video,
  broadcast_sent: Megaphone,
  whatsapp_sent: MessageSquare,
  carmen_message: Bot,
  automation_message: Zap,
};

/** Composer choices plus kinds other flows write (meeting summaries, pulse overrides, system sends, group digests): shown and filterable, not offered in the composer. */
export const DISPLAY_UPDATE_TYPES = [
  ...INTERACTION_TYPES,
  { value: "meeting_summary", label: "סיכום פגישה", icon: Video },
  { value: "pulse_override", label: "תיקון דופק", icon: Activity },
  ...SYSTEM_SEND_UPDATE_TYPES.map((type) => ({
    ...type,
    icon: SYSTEM_SEND_TYPE_ICONS[type.value],
  })),
  // Carmen's group digest entries (AIO-254).
  ...CARD_DRAFT_TYPES.map((type) => ({ ...type, icon: MessageSquare })),
];
