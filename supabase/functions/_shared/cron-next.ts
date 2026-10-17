// Pure 5-field cron helpers shared by edge functions and the browser.
// Supports "*", lists (1,2), ranges (1-5), steps (*/15, 1-30/5) and named
// days/months are NOT supported. Day-of-week: 0 or 7 = Sunday.
// Standard cron semantics: when both day-of-month and day-of-week are
// restricted, a day matches if EITHER matches.

export type CronFields = {
  minutes: number[];
  hours: number[];
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
};

function parseField(
  raw: string,
  min: number,
  max: number,
): { values: number[]; restricted: boolean } | null {
  const out = new Set<number>();
  let restricted = true;
  for (const part of raw.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
      if (stepPart === undefined) restricted = false;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-").map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      lo = a;
      hi = b;
    } else {
      const v = Number(rangePart);
      if (!Number.isInteger(v)) return null;
      lo = v;
      hi = stepPart === undefined ? v : max;
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  if (out.size === 0) return null;
  return { values: [...out].sort((a, b) => a - b), restricted };
}

export function parseCron(expr: string): CronFields | null {
  const parts = (expr || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = parseField(parts[0], 0, 59);
  const hour = parseField(parts[1], 0, 23);
  const dom = parseField(parts[2], 1, 31);
  const month = parseField(parts[3], 1, 12);
  const dow = parseField(parts[4], 0, 7);
  if (!minute || !hour || !dom || !month || !dow) return null;
  const daysOfWeek = new Set(dow.values.map((d) => (d === 7 ? 0 : d)));
  return {
    minutes: minute.values,
    hours: hour.values,
    daysOfMonth: new Set(dom.values),
    months: new Set(month.values),
    daysOfWeek,
    domRestricted: dom.restricted,
    dowRestricted: dow.restricted,
  };
}

export function isValidCron(expr: string): boolean {
  return parseCron(expr) !== null;
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function localParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const get = (type: string) =>
    Number(fmt.formatToParts(date).find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const floored = Math.floor(date.getTime() / 60_000) * 60_000;
  return asUtc - floored;
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - tzOffsetMs(new Date(guess), timeZone);
  const second = guess - tzOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/**
 * Next occurrence strictly after `from` for a 5-field cron evaluated in
 * `timeZone` (default Asia/Jerusalem). Returns null for an invalid
 * expression or when nothing matches within ~4 years.
 */
export function nextCronRun(
  expr: string,
  from: Date,
  timeZone = "Asia/Jerusalem",
): Date | null {
  const cron = parseCron(expr);
  if (!cron) return null;
  const start = localParts(from, timeZone);
  // Walk calendar days in the target zone (date math on a UTC "calendar").
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  for (let i = 0; i < 366 * 4; i++) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    const dow = cursor.getUTCDay();
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!cron.months.has(m)) continue;
    const domOk = cron.daysOfMonth.has(d);
    const dowOk = cron.daysOfWeek.has(dow);
    const dayOk =
      cron.domRestricted && cron.dowRestricted
        ? domOk || dowOk
        : cron.domRestricted
          ? domOk
          : cron.dowRestricted
            ? dowOk
            : true;
    if (!dayOk) continue;
    for (const h of cron.hours) {
      for (const min of cron.minutes) {
        const at = zonedToUtc(y, m, d, h, min, timeZone);
        // Skip wall-clock times that do not exist (DST gap) — they map to a
        // different local hour.
        const check = localParts(at, timeZone);
        if (check.hour !== h || check.minute !== min) continue;
        if (at.getTime() > from.getTime()) return at;
      }
    }
  }
  return null;
}

const DOW_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Short Hebrew description for common shapes; falls back to the raw expression. */
export function describeCronHe(expr: string): string {
  const cron = parseCron(expr);
  if (!cron) return expr;
  const parts = expr.trim().split(/\s+/);
  const [minRaw, hourRaw, domRaw, monRaw, dowRaw] = parts;
  const everyMin = /^\*\/(\d+)$/.exec(minRaw);
  if (everyMin && hourRaw === "*" && domRaw === "*" && monRaw === "*") {
    return `כל ${everyMin[1]} דקות`;
  }
  if (
    minRaw === "0" &&
    hourRaw === "*" &&
    domRaw === "*" &&
    monRaw === "*" &&
    dowRaw === "*"
  ) {
    return "כל שעה";
  }
  const everyHours = /^\*\/(\d+)$/.exec(hourRaw);
  if (
    cron.minutes.length === 1 &&
    everyHours &&
    domRaw === "*" &&
    monRaw === "*" &&
    dowRaw === "*"
  ) {
    return `כל ${everyHours[1]} שעות`;
  }
  if (
    cron.minutes.length === 1 &&
    /^\d+(,\d+)*$/.test(hourRaw) &&
    monRaw === "*"
  ) {
    const times = cron.hours
      .map((h) => `${pad(h)}:${pad(cron.minutes[0])}`)
      .join(", ");
    if (domRaw === "*" && dowRaw === "*") return `כל יום ב-${times}`;
    if (domRaw === "*" && cron.dowRestricted) {
      const days = [...cron.daysOfWeek]
        .sort()
        .map((d) => DOW_HE[d])
        .join(", ");
      if (days === "ראשון, שני, שלישי, רביעי, חמישי")
        return `בימי חול (א׳–ה׳) ב-${times}`;
      return `כל ${days} ב-${times}`;
    }
    if (dowRaw === "*" && cron.domRestricted) {
      return `כל חודש ב-${[...cron.daysOfMonth].sort((a, b) => a - b).join(", ")} ב-${times}`;
    }
  }
  return expr;
}
