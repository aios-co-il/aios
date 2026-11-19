import { LANDING_BLOCK_TYPES, type LandingBlock } from "./page-content.ts";
import { parseProofBlock } from "./page-block-more.ts";
import {
  card,
  form,
  items,
  lines,
  optional,
  record,
  text,
} from "./page-fields.ts";
import { imageUrl, video } from "./page-media.ts";

/** Validates one section; null when its type is unknown. */
export function parseBlock(
  raw: Record<string, unknown>,
  where: string,
  problems: Array<string>,
): LandingBlock | null {
  /** The section's heading, required by some types and optional in the rest. */
  function heading(required: boolean) {
    return text(raw, "heading", 200, where, problems, required);
  }
  switch (raw.type) {
    case "hero":
      return {
        type: "hero",
        heading: heading(true),
        ...optional(
          "subheading",
          text(raw, "subheading", 500, where, problems, false),
        ),
        ...listed(
          "bullets",
          lines(raw, "bullets", { max: 4, itemMax: 120 }, where, problems),
        ),
        ...imageUrl(raw, where, problems),
        ...video(raw, where, problems),
        form: form(raw, where, problems),
      };
    case "text":
      return {
        type: "text",
        ...optional("heading", heading(false)),
        body: text(raw, "body", 10000, where, problems),
        ...listed(
          "points",
          lines(raw, "points", { max: 8, itemMax: 200 }, where, problems),
        ),
        ...optional(
          "closing",
          text(raw, "closing", 300, where, problems, false),
        ),
        ...video(raw, where, problems),
        ...button(raw, where, problems),
      };
    case "features":
      return {
        type: "features",
        ...optional("heading", heading(false)),
        items: items(raw, 12, where, problems).map((item, index) => {
          const entry = record(item);
          const at = `${where}.items.${index + 1}`;
          return {
            title: text(entry, "title", 120, at, problems),
            ...optional("body", text(entry, "body", 1000, at, problems, false)),
          };
        }),
      };
    case "myths":
      return {
        type: "myths",
        ...optional("heading", heading(false)),
        items: items(raw, 6, where, problems).map((item, index) => {
          const entry = record(item);
          const at = `${where}.items.${index + 1}`;
          return {
            myth: text(entry, "myth", 200, at, problems),
            answer: text(entry, "answer", 600, at, problems),
          };
        }),
      };
    case "services":
      return {
        type: "services",
        ...optional("heading", heading(false)),
        items: items(raw, 16, where, problems).map((item, index) =>
          card(item, 120, `${where}.items.${index + 1}`, problems),
        ),
        ...optional(
          "tagline",
          text(raw, "tagline", 300, where, problems, false),
        ),
      };
    case "faq":
      return {
        type: "faq",
        ...optional("heading", heading(false)),
        items: items(raw, 12, where, problems).map((item, index) => {
          const entry = record(item);
          const at = `${where}.items.${index + 1}`;
          return {
            question: text(entry, "question", 200, at, problems),
            answer: text(entry, "answer", 2000, at, problems),
          };
        }),
      };
    case "leadForm":
      return {
        type: "leadForm",
        heading: heading(true),
        ...optional("body", text(raw, "body", 1000, where, problems, false)),
        form: form(raw, where, problems),
      };
    case "cta":
      return {
        type: "cta",
        heading: heading(true),
        ...optional("body", text(raw, "body", 1000, where, problems, false)),
        label: text(raw, "label", 80, where, problems),
      };
    case "steps":
    case "testimonials":
    case "comparison":
      return parseProofBlock(raw, where, problems);
    default:
      problems.push(
        `${where}: סוג לא מוכר${typeof raw.type === "string" ? ` "${raw.type}"` : ""}. הסוגים: ${LANDING_BLOCK_TYPES.join(", ")}`,
      );
      return null;
  }
}

/** An optional list: present only when it has lines. */
function listed<K extends string>(key: K, value: Array<string>) {
  return (value.length > 0 ? { [key]: value } : {}) as {
    [P in K]?: Array<string>;
  };
}

/** A text section's button: none, or its label (it always leads to the lead form). */
function button(
  raw: Record<string, unknown>,
  where: string,
  problems: Array<string>,
): { cta?: { label: string } } {
  if (raw.cta === undefined || raw.cta === null) {
    return {};
  }
  const label = text(record(raw.cta), "label", 80, `${where}.cta`, problems);
  return label ? { cta: { label } } : {};
}
