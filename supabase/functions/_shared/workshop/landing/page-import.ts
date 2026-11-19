/**
 * A live page read back into Carmen's model, so she can edit a page that already exists. The
 * import refuses a page it cannot carry whole: rebuilding it must never drop a section, a video
 * or a field the live page has.
 */
import { contentJson } from "./page-files.ts";
import { type LandingBlock, parseLandingBlocks } from "./page-content.ts";
import { type LandingStyle, parseLandingStyle } from "./page-style.ts";
import { record } from "./page-fields.ts";

/** What Carmen is told the imported style is: the live page's own look. */
const IMPORTED_DIRECTION = "הסגנון של העמוד הקיים, כמו שהוא באוויר.";

/** The page's sections and style, or why it cannot be imported whole. */
export function importLandingPage(
  content: string,
): { blocks: Array<LandingBlock>; style: LandingStyle } | { error: string } {
  let raw: Record<string, unknown>;
  try {
    raw = record(JSON.parse(content));
  } catch {
    return { error: "content.json של העמוד אינו JSON תקין" };
  }
  const theme = record(raw.theme);
  const { style, problems: styleProblems } = parseLandingStyle({
    primary_color: theme.primaryColor,
    accents: theme.accents,
    hero: theme.hero ?? "light",
    direction: IMPORTED_DIRECTION,
  });
  const appBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  const { blocks, problems } = parseLandingBlocks(appBlocks.map(carmenBlock));
  if (!style || styleProblems.length > 0 || problems.length > 0) {
    return {
      error: `העמוד לא יובא: ${[...styleProblems, ...problems].join("; ")}`,
    };
  }
  // Built back from the imported model, the page must be the live page exactly.
  const lost = lostBlocks(JSON.parse(contentJson(blocks, style)), raw);
  if (lost.length > 0) {
    return {
      error: `העמוד לא יובא: יש בו מה שכרמן לא יודעת לשמור (${lost.join(", ")}). עריכה שלו עוברת דרך משימת פיתוח.`,
    };
  }
  return { blocks, style };
}

/**
 * A section in Carmen's shape: a button keeps only its label, since every button leads to the
 * lead form. A button that leads elsewhere does not survive the rebuild, so the import refuses it.
 */
function carmenBlock(entry: unknown): unknown {
  const block = record(entry);
  if (block.type === "text" && block.cta) {
    return { ...block, cta: { label: record(block.cta).label } };
  }
  if (block.type !== "cta") {
    return entry;
  }
  const { cta, ...rest } = block;
  return { ...rest, label: record(cta).label };
}

/** Where the rebuilt page differs from the live one: "theme" or "מקטע N", none when equal. */
function lostBlocks(
  rebuilt: Record<string, unknown>,
  live: Record<string, unknown>,
): Array<string> {
  const lost: Array<string> = [];
  // The app's own defaults: a theme that leaves them out means the same page.
  const liveTheme = {
    dir: "rtl",
    lang: "he",
    hero: "light",
    ...record(live.theme),
  };
  if (canonical(rebuilt.theme) !== canonical(liveTheme)) {
    lost.push("theme");
  }
  const before = Array.isArray(live.blocks) ? live.blocks : [];
  const after = Array.isArray(rebuilt.blocks) ? rebuilt.blocks : [];
  before.forEach((block, index) => {
    if (canonical(block) !== canonical(after[index])) {
      lost.push(`מקטע ${index + 1}`);
    }
  });
  if (Object.keys(live).some((key) => key !== "theme" && key !== "blocks")) {
    lost.push("שדות מחוץ ל-theme ו-blocks");
  }
  return lost;
}

/**
 * JSON with every object's keys sorted, so equal content compares equal. The database keeps a
 * jsonb object's keys in its own order, so a value read back never matches by plain stringify.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : inner,
  );
}
