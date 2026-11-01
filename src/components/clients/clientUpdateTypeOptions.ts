import {
  Activity,
  AlertTriangle,
  Bot,
  FileText,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquare,
  Phone,
  StickyNote,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  SYSTEM_SEND_UPDATE_TYPES,
  type SystemSendUpdateType,
} from "../../../supabase/functions/_shared/client-card/send-kind.ts";
import { CARD_DRAFT_TYPES } from "../../../supabase/functions/_shared/manager-round/card-draft.ts";

export const INTERACTION_TYPES = [
  { value: "call", label: "שיחה", icon: Phone },
  { value: "email", label: "מייל", icon: Mail },
  { value: "meeting", label: "פגישה", icon: Video },
  { value: "whatsapp", label: "וואטסאפ", icon: MessageSquare },
  { value: "weekly_update", label: "עדכון שבועי", icon: AlertTriangle },
  { value: "seo_update", label: "עדכון SEO", icon: AlertTriangle },
  { value: "meeting_summary", label: "סיכום פגישה", icon: Video },
  { value: "other", label: "אחר", icon: AlertTriangle },
  { value: "pulse_override", label: "תיקון דופק", icon: Activity },
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

/** Composer types plus those other writers use (Carmen's add_client_update, system sends): shown and filterable, not offered in the composer. */
export const DISPLAY_UPDATE_TYPES = [
  ...INTERACTION_TYPES,
  { value: "note", label: "הערה", icon: StickyNote },
  { value: "complaint", label: "תלונה", icon: AlertTriangle },
  ...SYSTEM_SEND_UPDATE_TYPES.map((type) => ({
    ...type,
    icon: SYSTEM_SEND_TYPE_ICONS[type.value],
  })),
  // Carmen's group digest entries (AIO-254).
  ...CARD_DRAFT_TYPES.map((type) => ({ ...type, icon: MessageSquare })),
];
