/**
 * What Carmen learns from looking at a client's website: how it writes, which colors and fonts it
 * uses and which pictures it shows. Plain TypeScript over the page's HTML; no network here.
 */

export interface SiteImage {
  url: string;
  alt: string;
  role: "logo" | "og" | "image";
}

export interface SiteReport {
  url: string;
  title: string;
  description: string;
  lang: string;
  colors: string[];
  fonts: string[];
  headings: string[];
  copy: string[];
  buttons: string[];
  images: SiteImage[];
  logo: string | null;
  social: string[];
  stylesheets: string[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export const decodeEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(Number.parseInt(n, 16)),
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name) => ENTITIES[name.toLowerCase()] ?? match,
    );

const textOf = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const withoutNoise = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

const attr = (tag: string, name: string) => {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? "") : "";
};

const absolute = (value: string, base: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || /^(data|javascript|blob|mailto|tel):/i.test(trimmed))
    return null;
  try {
    const url = new URL(trimmed, base);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
};

const unique = <T>(values: T[]) => [...new Set(values)];

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

/** A color worth naming: greys, black and white are the page's neutrals, not its brand. */
function isChromatic(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min >= 28 && max >= 40;
}

/** The brand colors in a stretch of CSS or markup, most used first. */
export function colorsFrom(text: string, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(
    /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi,
  )) {
    let hex = match[1].toLowerCase();
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    hex = hex.slice(0, 6);
    if (!isChromatic(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  for (const match of text.matchAll(
    /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/gi,
  )) {
    const parts = [match[1], match[2], match[3]].map((n) =>
      Math.min(255, Number(n)),
    );
    const hex = parts.map((n) => n.toString(16).padStart(2, "0")).join("");
    if (!isChromatic(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hex]) => `#${hex}`);
}

const GENERIC_FONTS = new Set([
  "inherit",
  "initial",
  "unset",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "blinkmacsystemfont",
  "arial",
  "helvetica",
  "helvetica neue",
  "times new roman",
  "segoe ui",
  "roboto",
  "tahoma",
  "verdana",
  "georgia",
  "courier new",
]);

/** The fonts a page names, skipping the system fallbacks every page lists. */
export function fontsFrom(text: string, limit = 4): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    for (const part of match[1].split(",")) {
      const name = part
        .replace(/!important/i, "")
        .replace(/["']/g, "")
        .trim();
      if (!name || name.startsWith("var(") || name.length > 40) continue;
      if (GENERIC_FONTS.has(name.toLowerCase())) continue;
      found.push(name);
    }
  }
  for (const match of text.matchAll(
    /fonts\.googleapis\.com\/css2?\?([^"'\s)>]+)/gi,
  )) {
    for (const family of match[1].matchAll(/family=([^&:;]+)/g))
      found.push(decodeURIComponent(family[1].replace(/\+/g, " ")));
  }
  return unique(found).slice(0, limit);
}

const BAD_IMAGE =
  /(pixel|tracking|spacer|sprite|1x1|blank\.|facebook\.com\/tr|analytics|badge|icon-)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;
const OTHER_EXT = /\.(svg|ico|avif|bmp|tiff?|mp4|webm|pdf)(\?|#|$)/i;

const SOCIAL =
  /^https?:\/\/(www\.)?(facebook|instagram|linkedin|tiktok|youtube|twitter|x)\.com\//i;

export function siteReport(html: string, pageUrl: string): SiteReport {
  const page = withoutNoise(html);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? html;
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key: string) => {
    for (const tag of metas) {
      const name = (attr(tag, "name") || attr(tag, "property")).toLowerCase();
      if (name === key) return attr(tag, "content");
    }
    return "";
  };
  const title =
    textOf(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    meta("og:title");
  const description = meta("description") || meta("og:description");
  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0] ?? "", "lang");

  const styleText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");
  const inline = [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)]
    .map((m) => m[1])
    .join("\n");
  const cssBlob = `${styleText}\n${inline}\n${meta("theme-color")}`;
  const markup = html;
  const colors = colorsFrom(cssBlob);
  const fonts = fontsFrom(`${cssBlob}\n${markup}`);

  const headings = unique(
    [...page.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
      .map((m) => textOf(m[1]))
      .filter((t) => t.length >= 3 && t.length <= 140),
  ).slice(0, 10);

  const copy = unique(
    [...page.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => textOf(m[1]))
      .filter((t) => t.length >= 40),
  )
    .slice(0, 6)
    .map((t) => (t.length > 280 ? `${t.slice(0, 277)}...` : t));

  const buttons = unique(
    [
      ...[...page.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)].map((m) =>
        textOf(m[1]),
      ),
      ...[...page.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
        .filter((m) => /(btn|button|cta)/i.test(attr(`<a ${m[1]}>`, "class")))
        .map((m) => textOf(m[2])),
    ].filter((t) => t.length >= 2 && t.length <= 40),
  ).slice(0, 6);

  const images: SiteImage[] = [];
  const seen = new Set<string>();
  const push = (raw: string, alt: string, role: SiteImage["role"]) => {
    const url = absolute(raw, pageUrl);
    if (!url || seen.has(url) || BAD_IMAGE.test(url) || OTHER_EXT.test(url))
      return;
    if (
      role !== "og" &&
      role !== "logo" &&
      !IMAGE_EXT.test(url) &&
      /\.[a-z0-9]{2,4}(\?|$)/i.test(new URL(url).pathname)
    )
      return;
    seen.add(url);
    images.push({ url, alt: alt.slice(0, 120), role });
  };

  let logo: string | null = null;
  const ogImage = meta("og:image");
  if (ogImage) push(ogImage, "תמונת שיתוף של האתר", "og");
  for (const m of page.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src =
      attr(tag, "src") ||
      attr(tag, "data-src") ||
      attr(tag, "data-lazy-src") ||
      attr(tag, "data-original");
    if (!src) continue;
    const width = Number(attr(tag, "width"));
    const height = Number(attr(tag, "height"));
    if ((width && width < 60) || (height && height < 60)) continue;
    const alt = attr(tag, "alt");
    const isLogo = /logo/i.test(`${src} ${alt} ${attr(tag, "class")}`);
    if (isLogo) {
      const url = absolute(src, pageUrl);
      if (url && !logo) logo = url;
      continue;
    }
    push(src, alt, "image");
  }
  if (!logo) {
    for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
      if (/apple-touch-icon/i.test(attr(m[0], "rel"))) {
        logo = absolute(attr(m[0], "href"), pageUrl);
        if (logo) break;
      }
    }
  }

  const stylesheets = unique(
    [...head.matchAll(/<link\b[^>]*>/gi)]
      .filter((m) => /stylesheet/i.test(attr(m[0], "rel")))
      .map((m) => absolute(attr(m[0], "href"), pageUrl))
      .filter((u): u is string => !!u),
  ).slice(0, 3);

  const social = unique(
    [...page.matchAll(/<a\b[^>]*>/gi)]
      .map((m) => absolute(attr(m[0], "href"), pageUrl))
      .filter((u): u is string => !!u && SOCIAL.test(u)),
  ).slice(0, 5);

  return {
    url: pageUrl,
    title,
    description,
    lang,
    colors,
    fonts,
    headings,
    copy,
    buttons,
    images: images.slice(0, 12),
    logo,
    social,
    stylesheets,
  };
}

/** The report as a few lines Carmen and the user can both read. */
export function describeSite(report: SiteReport): string {
  const lines = [
    `אתר: ${report.title || report.url}`,
    report.description && `תיאור: ${report.description}`,
    report.colors.length > 0 && `צבעי מותג: ${report.colors.join(", ")}`,
    report.fonts.length > 0 && `גופנים: ${report.fonts.join(", ")}`,
    report.headings.length > 0 && `כותרות: ${report.headings.join(" | ")}`,
    report.buttons.length > 0 && `כפתורי פעולה: ${report.buttons.join(" | ")}`,
    report.copy.length > 0 && `דוגמאות קופי: ${report.copy.join(" || ")}`,
    report.logo && `לוגו: ${report.logo}`,
    report.images.length > 0 && `${report.images.length} תמונות נמצאו באתר`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Merges the colors and fonts of the page's stylesheets into its report. */
export function withStylesheets(report: SiteReport, css: string[]): SiteReport {
  if (css.length === 0) return report;
  const blob = css.join("\n");
  return {
    ...report,
    colors: unique([...report.colors, ...colorsFrom(blob)]).slice(0, 6),
    fonts: unique([...report.fonts, ...fontsFrom(blob)]).slice(0, 4),
  };
}
