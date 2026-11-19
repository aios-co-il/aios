type Section = Record<string, unknown>;

const SOURCE_LABELS = {
  gsc: "Search Console",
  ahrefs: "Ahrefs",
  program: "תוכנית SEO",
  ai: "נראות ב-AI",
} as const;
const DROP_PCT = -15;
const RISE_PCT = 15;

/**
 * What needs attention, in Hebrew, from the overview's sections: missing
 * connections, traffic drops or rises, quick wins, calendar problems, a
 * falling monthly status and AI-visibility drops. Carmen turns these into a
 * recommendation; they are facts, not advice.
 */
export function seoSignals(sections: {
  gsc: Section;
  ahrefs: Section;
  program: Section;
  ai: Section;
}): Array<string> {
  const signals: Array<string> = [];
  for (const [key, section] of Object.entries(sections)) {
    if (section.status !== "ok") {
      const label = SOURCE_LABELS[key as keyof typeof SOURCE_LABELS];
      signals.push(`${label}: ${String(section.message ?? section.status)}`);
    }
  }
  const { gsc, ahrefs, program, ai } = sections;
  if (gsc.status === "ok") {
    if (gsc.stale === true) {
      signals.push("נתוני Search Console לא סונכרנו ביומיים האחרונים.");
    }
    trend(
      signals,
      num(gsc.clicks_per_day_change_pct),
      "בקליקים ליום מגוגל (מול חלון לפני חודש)",
    );
    const quickWins = list(gsc.striking_distance).length;
    if (quickWins > 0) {
      signals.push(
        `${quickWins} שאילתות במקומות 4–20 עם הרבה חשיפות — הזדמנות לשפר עמודים קיימים.`,
      );
    }
  }
  if (ahrefs.status === "ok") {
    const change = obj(ahrefs.change_vs_3_months_pct);
    trend(
      signals,
      num(change.organic_traffic),
      "בתנועה האורגנית לפי Ahrefs (מול לפני 3 חודשים)",
    );
    trend(
      signals,
      num(change.referring_domains),
      "בדומיינים מפנים (מול לפני 3 חודשים)",
    );
  }
  if (program.status === "ok") {
    const calendar = obj(program.calendar);
    const failed = list(calendar.failed).length;
    if (failed > 0) {
      signals.push(`${failed} כתבות בלוח התוכן נכשלו בפרסום.`);
    }
    if ((num(calendar.overdue) ?? 0) > 0) {
      signals.push(
        `${num(calendar.overdue)} כתבות בלוח התוכן עברו את התאריך ולא פורסמו.`,
      );
    }
    if ((num(calendar.awaiting_approval) ?? 0) > 0) {
      signals.push(`${num(calendar.awaiting_approval)} כתבות ממתינות לאישור.`);
    }
    const lastMonth = obj(list(program.monthly_updates)[0]);
    if (lastMonth.status === "down") {
      signals.push(
        `העדכון החודשי האחרון (${String(lastMonth.month)}) מסומן כירידה.`,
      );
    }
  }
  if (ai.status === "ok") {
    const change = num(ai.score_change);
    if (change !== null && change <= -10) {
      signals.push(
        `ציון הנראות ב-AI ירד ב-${Math.abs(change)} נקודות מהשבוע הקודם.`,
      );
    }
  }
  return signals;
}

/** Adds a drop or rise signal when the change crosses the thresholds. */
function trend(signals: Array<string>, pct: number | null, what: string): void {
  if (pct !== null && pct <= DROP_PCT) {
    signals.push(`ירידה של ${Math.abs(pct)}% ${what}.`);
  } else if (pct !== null && pct >= RISE_PCT) {
    signals.push(`עלייה של ${pct}% ${what}.`);
  }
}

/** A number, else null. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** An object, else an empty one. */
function obj(value: unknown): Section {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Section)
    : {};
}

/** An array, else an empty one. */
function list(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}
