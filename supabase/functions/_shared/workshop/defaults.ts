/**
 * What Carmen decides for the user so nobody fills in settings. Plain TypeScript with no
 * Deno APIs, imported by the edge function tools and by the workshop UI.
 */

export const FORMATS = ["9:16", "4:5", "1:1", "16:9"] as const;
export type Format = (typeof FORMATS)[number];
export type ProjectKind = "video" | "static" | "campaign";

export const DEFAULT_VISUAL_STYLE = "adaptive";
export const DEFAULT_FILM_SECONDS = 15;
const MAX_FILM_SECONDS = 90;
const MAX_SCENES = 20;

const VIDEO_WORDS =
  /סרטון|(?<![א-ת])סרט(?![א-ת])|וידאו|ווידאו|ריל|רילס|קליפ|אנימציה|סטורי נע|טיקטוק|\bvideo\b|\breels?\b|\btiktok\b/i;
const CAMPAIGN_WORDS = /קמפיין|קמפיינים|\bcampaign\b/i;

const FORMAT_WORDS: { format: Format; words: RegExp }[] = [
  { format: "9:16", words: /9\s*:\s*16|סטורי|סטוריז|ריל|רילס|טיקטוק|אנכי|\bstory\b|\bstories\b|\breels?\b|\btiktok\b|\bvertical\b/i },
  { format: "4:5", words: /4\s*:\s*5|פיד|\bfeed\b/i },
  { format: "1:1", words: /1\s*:\s*1|ריבוע|\bsquare\b/i },
  { format: "16:9", words: /16\s*:\s*9|יוטיוב|\byoutube\b|לנדסקייפ|\blandscape\b|(?<![א-ת])רחב(?![א-ת])|אופקי|באנר לאתר/i },
];

export function inferKind(text: string): ProjectKind {
  if (VIDEO_WORDS.test(text)) return "video";
  if (CAMPAIGN_WORDS.test(text)) return "campaign";
  return "static";
}

/** Every format the request names, in the order of FORMAT_WORDS; the default when it names none. */
export function inferFormats(text: string, kind: ProjectKind): Format[] {
  const named = FORMAT_WORDS.filter((entry) => entry.words.test(text)).map(
    (entry) => entry.format,
  );
  if (named.length > 0) return kind === "video" ? [named[0]] : named;
  return [kind === "video" ? "9:16" : "1:1"];
}

const SECONDS = /(\d+(?:\.\d+)?)\s*(?:שניות|שניה|שנייה|שנ׳|sec(?:onds?)?|s\b)/i;
const MINUTES = /(\d+(?:\.\d+)?)\s*(?:דקות|דקה|min(?:utes?)?)/i;
const ONE_MINUTE = /(?:^|\s)דקה(?:\s|$|[.,!?])/;

export function inferFilmSeconds(text: string): number {
  const seconds = SECONDS.exec(text);
  const minutes = MINUTES.exec(text);
  let value = DEFAULT_FILM_SECONDS;
  if (seconds) value = Number(seconds[1]);
  else if (minutes) value = Number(minutes[1]) * 60;
  else if (ONE_MINUTE.test(text)) value = 60;
  return Math.min(Math.max(Math.round(value), 3), MAX_FILM_SECONDS);
}

/** A beat is about three seconds; long films use longer beats so the scene count stays workable. */
export function planScenes(totalSeconds: number) {
  const beat = totalSeconds > 60 ? 6 : totalSeconds > 30 ? 4 : 3;
  const scenes = Math.min(
    Math.max(Math.round(totalSeconds / beat), 1),
    MAX_SCENES,
  );
  return { scenes, sceneSeconds: Math.round((totalSeconds / scenes) * 10) / 10 };
}

export type ContentType = "posts" | "ads" | "script";

export function inferContentType(text: string, kind: ProjectKind): ContentType {
  if (kind === "video" || /תסריט|\bscript\b/i.test(text)) return "script";
  if (/מודעה|מודעות|ממומן|\bads?\b/i.test(text)) return "ads";
  return "posts";
}

/** A short title from the brief: its first words, without trailing punctuation. */
export function titleFromBrief(brief: string, max = 6): string {
  const words = brief
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, max);
  return words.join(" ").replace(/[.,;:!?]+$/, "") || "פרויקט חדש";
}

export interface StartProjectInput {
  brief: string;
  title?: string;
  kind?: ProjectKind;
  formats?: string[];
  duration_s?: number;
  visual_style?: string;
}

export interface StartProjectPlan {
  title: string;
  kind: ProjectKind;
  projectType: "video" | "static";
  format: Format;
  formats: Format[];
  contentType: ContentType;
  visualStyle: string;
  film: { totalSeconds: number; scenes: number; sceneSeconds: number } | null;
  summary: string;
}

const isFormat = (value: unknown): value is Format =>
  typeof value === "string" && (FORMATS as readonly string[]).includes(value);

/** Everything the project needs, from one free sentence plus whatever the model already knows. */
export function planProject(input: StartProjectInput): StartProjectPlan {
  const brief = input.brief.trim();
  const kind = input.kind ?? inferKind(brief);
  const projectType = kind === "video" ? "video" : "static";
  const named = (input.formats ?? []).filter(isFormat);
  const formats = named.length > 0 ? named : inferFormats(brief, kind);
  const totalSeconds =
    projectType === "video"
      ? Number.isFinite(input.duration_s)
        ? Math.min(Math.max(Math.round(Number(input.duration_s)), 3), MAX_FILM_SECONDS)
        : inferFilmSeconds(brief)
      : 0;
  const film =
    projectType === "video"
      ? { totalSeconds, ...planScenes(totalSeconds) }
      : null;
  const title = input.title?.trim() || titleFromBrief(brief);
  const visualStyle = input.visual_style?.trim() || DEFAULT_VISUAL_STYLE;
  const summary = film
    ? `סרטון ${formats[0]}, ${film.totalSeconds} שניות, ${film.scenes} סצנות`
    : kind === "campaign"
      ? `קמפיין: קונספטים, קופי ומודעות בפורמטים ${formats.join(", ")}`
      : `מודעה בפורמטים ${formats.join(", ")}`;
  return {
    title,
    kind,
    projectType,
    format: formats[0],
    formats,
    contentType: inferContentType(brief, kind),
    visualStyle,
    film,
    summary,
  };
}

/** Planning price of one gpt-image-1 picture at default quality, by canvas; shown before any spend. */
export const IMAGE_USD: Record<Format, number> = {
  "1:1": 0.17,
  "4:5": 0.25,
  "9:16": 0.25,
  "16:9": 0.25,
};

export function estimateImages(formats: Format[], perFormat = 1) {
  const images = formats.length * perFormat;
  const usd = formats.reduce((sum, format) => sum + IMAGE_USD[format] * perFormat, 0);
  return { images, usd: Math.round(usd * 100) / 100 };
}

export const imageFormatsFrom = (value: unknown, fallback: Format[]): Format[] => {
  const list = Array.isArray(value) ? value.filter(isFormat) : [];
  return list.length > 0 ? [...new Set(list)] : fallback;
};
