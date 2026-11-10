import {
  BarChart3,
  ListChecks,
  Mail,
  MessageCircle,
  PenLine,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const WHATSAPP_URL =
  "https://wa.me/972507677613?text=" +
  encodeURIComponent("שלום, הגעתי מאתר AIOS ואשמח לשמוע פרטים.");

export const NAV_LINKS = [
  { href: "#why", label: "הגישה" },
  { href: "#system", label: "המערכת" },
  { href: "#workflow", label: "איך זה עובד" },
];

export interface LandingModule {
  n: string;
  title: string;
  desc: string;
  icon: LucideIcon;
}

export const MODULES: Array<LandingModule> = [
  {
    n: "01",
    title: "CRM ולידים",
    desc: "אני מכירה את הלקוחות שלך. כל ליד, שיחה וסטטוס במקום אחד.",
    icon: Users,
  },
  {
    n: "02",
    title: "WhatsApp ואוטומציות",
    desc: "ליד חדש? אני עוזרת להניע את התקשורת והמשך הטיפול.",
    icon: MessageCircle,
  },
  {
    n: "03",
    title: "דוחות ודשבורדים",
    desc: "אני מחברת את הנתונים לתמונה שאפשר להבין ולפעול לפיה.",
    icon: BarChart3,
  },
  {
    n: "04",
    title: "משימות וצוות",
    desc: "כל משימה קשורה לתוכנית. כל תוכנית קשורה למטרה.",
    icon: ListChecks,
  },
  {
    n: "05",
    title: "כספים",
    desc: "הכנסות, הוצאות ותמונת העסק — בלי לעבור בין מערכות.",
    icon: Wallet,
  },
  {
    n: "06",
    title: "חתימה דיגיטלית",
    desc: "מסמכים ואישורים שנשארים בתוך תהליך העבודה.",
    icon: PenLine,
  },
  {
    n: "07",
    title: "דיוור",
    desc: "תקשורת שיווקית שמתחברת למסע הלקוח.",
    icon: Mail,
  },
  {
    n: "08",
    title: "קריאייטיב וקופי",
    desc: "רעיונות, מסרים ותוצרים שמתחברים לתוכנית השיווק.",
    icon: Sparkles,
  },
];

export const CONNECTIONS = [
  "אסטרטגיה",
  "קמפיינים",
  "SEO / GEO",
  "דיוור / סושיאל",
  "מכירות",
];

export const JOURNEY_STEPS = [
  { n: "01", title: "ליד נכנס", desc: "כל פנייה מקבלת מקום" },
  { n: "02", title: "WhatsApp", desc: "תקשורת אוטומטית" },
  { n: "03", title: "CRM", desc: "תיעוד ומעקב" },
  { n: "04", title: "משימה", desc: "המשך טיפול בצוות" },
];

export const AUDIENCES = [
  {
    title: "לעסקים",
    desc: "מקום אחד לנהל בו את השיווק, המכירות והפעילות.",
  },
  {
    title: "לסוכנויות",
    desc: "תמונה אחידה של לקוחות, משימות, דוחות ותהליכים.",
  },
  {
    title: "עם צוות מומחים",
    desc: "כרמן לצד אנשי מקצוע שמובילים את הפעילות השיווקית.",
  },
];

export const LEGAL_LINKS = [
  { to: "/privacy", label: "מדיניות פרטיות" },
  { to: "/terms", label: "תנאי שימוש" },
  { to: "/data-deletion", label: "מחיקת מידע" },
];
