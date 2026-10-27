/**
 * The film's closing card: the logo, the call to action and the website. A call to action can be a
 * whole sentence (the waiting-list offer runs about 75 Hebrew characters), so it is wrapped into
 * at most three balanced lines and its size follows the longest line. Both the Remotion card
 * (manifest brand.ctaLines) and the ffmpeg card below use these lines.
 */

export const MAX_CTA_CHARS = 120;
export const MAX_CTA_LINES = 3;
/** Seconds the ffmpeg card lasts (Remotion's END_CARD_FRAMES at 30 fps). */
export const END_CARD_S = 2.5;
/** Width of a bold Hebrew glyph, in ems, on average (Heebo / DejaVu Sans Bold). */
const GLYPH_EM = 0.56;

const words = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

function wrap(list, width) {
  const lines = [];
  let line = "";
  for (const word of list) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The call to action in reading order, one entry per line: one line when short, else the
 * narrowest wrap that fits in two or three lines, so the lines come out about even.
 */
export function ctaLines(text) {
  const list = words(String(text ?? "").slice(0, MAX_CTA_CHARS));
  if (!list.length) return [];
  const total = list.join(" ").length;
  const wanted = total <= 26 ? 1 : total <= 52 ? 2 : MAX_CTA_LINES;
  // A dash splits the sentence into its parts ("join the list — the first 1000 get..."): the
  // first part keeps its own line when the rest still fits the lines that are left.
  const dash = list.findIndex((word) => DASH.test(word));
  if (wanted > 1 && dash > 0 && dash < list.length - 1) {
    const head = list.slice(0, dash + 1).join(" ");
    const rest = balanced(list.slice(dash + 1), wanted - 1);
    const longest = Math.max(head.length, ...rest.map((line) => line.length));
    if (rest.length <= wanted - 1 && longest <= Math.ceil(total / wanted) + 8)
      return [head, ...rest];
  }
  return balanced(list, wanted);
}

const DASH = /^[—–-]$/;

/** The narrowest wrap of the words into at most `count` lines. */
function balanced(list, count) {
  const total = list.join(" ").length;
  const longest = Math.max(...list.map((word) => word.length));
  for (
    let width = Math.max(longest, Math.ceil(total / count));
    width <= total;
    width += 1
  ) {
    const lines = wrap(list, width);
    if (lines.length <= count) return lines;
  }
  return [list.join(" ")];
}

/**
 * Font size in pixels for the call to action on a frame: large for a short line, smaller as the
 * longest line grows, so every line fits within `widthShare` of the frame.
 */
export function ctaFontPx(
  lines,
  { width, height, widthShare = 0.8, maxShare = 0.058 },
) {
  const unit = Math.min(width, height);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const fit = (width * widthShare) / (longest * GLYPH_EM);
  return Math.max(16, Math.floor(Math.min(unit * maxShare, fit)));
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const color = (value, fallback) =>
  HEX.test(String(value ?? "")) ? `0x${expand(value.slice(1))}` : fallback;
const expand = (hex) =>
  hex.length === 3
    ? hex
        .split("")
        .map((c) => c + c)
        .join("")
    : hex;

/**
 * drawtext filters of the ffmpeg card: each CTA line centred on an accent band, the website
 * under them. Lines are read from files (no escaping), and drawtext shapes the Hebrew.
 */
export function endCardTextFilters({
  lineFiles,
  urlFile = null,
  fontPx,
  width,
  height,
  accent,
  fontFile,
  centreShare = 0.58,
}) {
  const step = Math.round(fontPx * 1.45);
  const top = Math.round(height * centreShare - (lineFiles.length * step) / 2);
  const band = color(accent, "0x08F467");
  const filters = lineFiles.map((file, index) =>
    [
      `drawtext=textfile='${file}'`,
      `fontfile='${fontFile}'`,
      `fontsize=${fontPx}`,
      "fontcolor=0x05080f",
      "box=1",
      `boxcolor=${band}`,
      `boxborderw=${Math.round(fontPx * 0.32)}`,
      "x=(w-text_w)/2",
      `y=${top + index * step}`,
    ].join(":"),
  );
  if (urlFile)
    filters.push(
      [
        `drawtext=textfile='${urlFile}'`,
        `fontfile='${fontFile}'`,
        `fontsize=${Math.round(Math.min(width, height) * 0.034)}`,
        "fontcolor=white@0.86",
        "x=(w-text_w)/2",
        `y=${top + lineFiles.length * step + Math.round(fontPx * 0.6)}`,
      ].join(":"),
    );
  return filters;
}

/** The ffmpeg card's background colour: the brand's second colour, else the film's navy. */
export const endCardBackground = (brand) =>
  color(brand?.secondaryColor, "0x07111c");

/** True when the film closes on a card: a brand with a logo or a call to action. */
export const hasEndCard = (brand) =>
  Boolean(
    brand &&
    brand.endCard !== false &&
    (brand.logoPath || words(brand.ctaText).length),
  );
