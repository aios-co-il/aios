/** The sections that prove a claim: numbered steps, testimonials with trust cards, a comparison. */
import type { LandingBlock } from "./page-content.ts";
import { card, items, lines, optional, record, text } from "./page-fields.ts";

/** Validates a steps, testimonials or comparison section; null for any other type. */
export function parseProofBlock(
  raw: Record<string, unknown>,
  where: string,
  problems: Array<string>,
): LandingBlock | null {
  const heading = optional(
    "heading",
    text(raw, "heading", 200, where, problems, false),
  );
  switch (raw.type) {
    case "steps": {
      const list = items(raw, 6, where, problems);
      if (list.length === 1) {
        problems.push(`${where}: steps צריך 2 שלבים לפחות`);
      }
      return {
        type: "steps",
        ...heading,
        items: list.map((item, index) => {
          const entry = record(item);
          const at = `${where}.items.${index + 1}`;
          return {
            title: text(entry, "title", 120, at, problems),
            body: text(entry, "body", 400, at, problems),
          };
        }),
        ...optional(
          "closing",
          text(raw, "closing", 300, where, problems, false),
        ),
      };
    }
    case "testimonials":
      return testimonials(raw, heading, where, problems);
    case "comparison":
      return comparison(raw, heading, where, problems);
    default:
      return null;
  }
}

/** Customer quotes and trust cards; a section needs at least one of the two. */
function testimonials(
  raw: Record<string, unknown>,
  heading: { heading?: string },
  where: string,
  problems: Array<string>,
): LandingBlock {
  const quotes = Array.isArray(raw.items) ? raw.items.slice(0, 6) : [];
  const badges = Array.isArray(raw.badges) ? raw.badges.slice(0, 6) : [];
  if (quotes.length === 0 && badges.length === 0) {
    problems.push(`${where}: צריך items (המלצות) או badges (כרטיסי אמון)`);
  }
  return {
    type: "testimonials",
    ...heading,
    items: quotes.map((item, index) => {
      const entry = record(item);
      const at = `${where}.items.${index + 1}`;
      return {
        quote: text(entry, "quote", 800, at, problems),
        name: text(entry, "name", 80, at, problems),
        ...optional("role", text(entry, "role", 120, at, problems, false)),
      };
    }),
    ...(badges.length > 0
      ? {
          badges: badges.map((badge, index) =>
            card(badge, 80, `${where}.badges.${index + 1}`, problems),
          ),
        }
      : {}),
  };
}

/** Two columns compared row by row; the second column is the client's. */
function comparison(
  raw: Record<string, unknown>,
  heading: { heading?: string },
  where: string,
  problems: Array<string>,
): LandingBlock {
  const columns = lines(
    raw,
    "columns",
    { max: 2, itemMax: 80 },
    where,
    problems,
  );
  if (columns.length !== 2) {
    problems.push(`${where}: columns צריך שתי עמודות בדיוק, השנייה של הלקוח`);
  }
  const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 12) : [];
  if (rows.length === 0) {
    problems.push(`${where}: rows ריק`);
  }
  return {
    type: "comparison",
    ...heading,
    columns: [columns[0] ?? "", columns[1] ?? ""],
    rows: rows.map((row, index) => {
      const entry = record(row);
      const at = `${where}.rows.${index + 1}`;
      const values = lines(
        entry,
        "values",
        { max: 2, itemMax: 200 },
        at,
        problems,
      );
      if (values.length !== 2) {
        problems.push(`${at}: values צריך שני ערכים, אחד לכל עמודה`);
      }
      return {
        label: text(entry, "label", 120, at, problems),
        values: [values[0] ?? "", values[1] ?? ""] as [string, string],
      };
    }),
  };
}
