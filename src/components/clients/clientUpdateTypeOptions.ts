import {
  Activity,
  AlertTriangle,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Video,
} from "lucide-react";

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

/** Composer types plus those other writers use (Carmen's add_client_update): shown and filterable, not offered in the composer. */
export const DISPLAY_UPDATE_TYPES = [
  ...INTERACTION_TYPES,
  { value: "note", label: "הערה", icon: StickyNote },
  { value: "complaint", label: "תלונה", icon: AlertTriangle },
];
