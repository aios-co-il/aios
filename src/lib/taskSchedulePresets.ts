// Friendly schedule presets <-> 5-field cron for the Carmen task editor.
import {
  isValidCron,
  parseCron,
} from "../../supabase/functions/_shared/cron-next.ts";

export type RecurringPreset =
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "every_minutes"
  | "every_hours"
  | "custom";

export type RecurringSchedule = {
  preset: RecurringPreset;
  time: string; // "HH:MM"
  weekday: number; // 0=Sunday
  monthDay: number; // 1-31
  everyMinutes: number;
  everyHours: number;
  cron: string;
};

export const DEFAULT_RECURRING: RecurringSchedule = {
  preset: "daily",
  time: "09:00",
  weekday: 0,
  monthDay: 1,
  everyMinutes: 30,
  everyHours: 4,
  cron: "0 9 * * *",
};

export const PRESET_LABELS: Record<RecurringPreset, string> = {
  daily: "כל יום",
  weekdays: "בימי חול (א׳–ה׳)",
  weekly: "כל שבוע",
  monthly: "כל חודש",
  every_minutes: "כל כמה דקות",
  every_hours: "כל כמה שעות",
  custom: "מותאם (cron)",
};

export const WEEKDAY_LABELS = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

function hm(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return [9, 0];
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return [h, min];
}

export function buildCron(s: RecurringSchedule): string {
  const [h, m] = hm(s.time);
  switch (s.preset) {
    case "daily":
      return `${m} ${h} * * *`;
    case "weekdays":
      return `${m} ${h} * * 0-4`;
    case "weekly":
      return `${m} ${h} * * ${s.weekday}`;
    case "monthly":
      return `${m} ${h} ${Math.min(28, Math.max(1, s.monthDay))} * *`;
    case "every_minutes":
      return `*/${Math.min(59, Math.max(5, s.everyMinutes))} * * * *`;
    case "every_hours":
      return `${m} */${Math.min(23, Math.max(1, s.everyHours))} * * *`;
    case "custom":
      return s.cron.trim();
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Best-effort reverse mapping so existing tasks open on the right preset. */
export function scheduleFromCron(
  cron: string | null | undefined,
): RecurringSchedule {
  const expr = (cron || "").trim();
  if (!expr || !isValidCron(expr)) {
    return {
      ...DEFAULT_RECURRING,
      preset: expr ? "custom" : "daily",
      cron: expr || DEFAULT_RECURRING.cron,
    };
  }
  const [mi, ho, dom, mon, dow] = expr.split(/\s+/);
  const base = { ...DEFAULT_RECURRING, cron: expr };
  const simpleTime = /^\d+$/.test(mi) && /^\d+$/.test(ho);
  const time = simpleTime ? `${pad(Number(ho))}:${pad(Number(mi))}` : base.time;
  const everyMin = /^\*\/(\d+)$/.exec(mi);
  if (everyMin && ho === "*" && dom === "*" && mon === "*" && dow === "*")
    return {
      ...base,
      preset: "every_minutes",
      everyMinutes: Number(everyMin[1]),
    };
  const everyHour = /^\*\/(\d+)$/.exec(ho);
  if (
    /^\d+$/.test(mi) &&
    everyHour &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  )
    return {
      ...base,
      preset: "every_hours",
      everyHours: Number(everyHour[1]),
      time: `00:${pad(Number(mi))}`,
    };
  if (simpleTime && mon === "*") {
    if (dom === "*" && dow === "*") return { ...base, preset: "daily", time };
    if (dom === "*" && dow === "0-4")
      return { ...base, preset: "weekdays", time };
    if (dom === "*" && /^[0-7]$/.test(dow))
      return { ...base, preset: "weekly", time, weekday: Number(dow) % 7 };
    if (/^\d+$/.test(dom) && dow === "*")
      return { ...base, preset: "monthly", time, monthDay: Number(dom) };
  }
  return { ...base, preset: "custom" };
}

export function isUsableCron(cron: string): boolean {
  const parsed = parseCron(cron);
  if (!parsed) return false;
  // Guard against accidental "every minute" schedules for AI tasks.
  return !(parsed.minutes.length > 12 && parsed.hours.length === 24);
}

export type TaskTemplate = {
  key: string;
  title: string;
  prompt: string;
  cron: string;
  mode?: string;
};

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    key: "pulse",
    title: "בדיקת דופק לקמפיינים",
    prompt:
      "בצעי בדיקת דופק לכל הקמפיינים הפעילים: השווי לאתמול ולשבוע שעבר, זהי חריגות ב-CPL, CTR, הוצאה ולידים, ושלחי לי סיכום קצר עם המלצה אחת לכל חריגה. אל תשני קמפיינים בלי אישור.",
    cron: "0 9 * * 0-4",
    mode: "analyst",
  },
  {
    key: "weekly_report",
    title: "דוח ביצועים שבועי",
    prompt:
      "הכיני דוח ביצועים שבועי לכל לקוח פעיל: הוצאה, לידים, CPL, מגמה מול השבוע הקודם, מה עבד ומה לא, ו-3 החלטות מומלצות לשבוע הבא. שלחי לי את הסיכום.",
    cron: "0 8 * * 0",
    mode: "analyst",
  },
  {
    key: "leads_followup",
    title: "מעקב לידים שלא טופלו",
    prompt:
      "בדקי לידים מה-48 שעות האחרונות שלא טופלו או שאין להם עדכון סטטוס. סכמי לפי לקוח ואיש מכירות ושלחי לי רשימה קצרה עם מי צריך לטפל.",
    cron: "0 10,16 * * 0-4",
    mode: "sales",
  },
  {
    key: "morning_brief",
    title: "סיכום בוקר",
    prompt:
      "סכמי לי את הבוקר: משימות פתוחות דחופות, יעדים שתקועים, חריגות בקמפיינים ואישורים שמחכים לי. עד 8 שורות.",
    cron: "30 7 * * 0-4",
  },
];
