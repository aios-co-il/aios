/**
 * The copy of a landing page as Carmen writes it: an ordered list of sections. Each section is a
 * block of the landing-pages app (aios-co-il/landing-pages, src/lib/content.ts), which owns the
 * schema; its check-pages is the final gate when the page is built. This validator applies the
 * same types and length limits early, so Carmen fixes a section while she is still writing it.
 */
import { parseBlock } from "./page-block.ts";
import { record } from "./page-fields.ts";

/** Fields a lead form asks for besides name and phone (the app's leadForm.fields). */
export const LANDING_FORM_FIELDS = ["companyName", "employees"] as const;
export type LandingFormField = (typeof LANDING_FORM_FIELDS)[number];

/** The lead form every landing page ends with; every call to action scrolls to it. */
export interface LandingForm {
  buttonLabel: string;
  successMessage: string;
  fields?: Array<LandingFormField>;
}

/** A card: a title, and a line that explains it to a reader who is not an expert. */
export interface LandingCard {
  title: string;
  body?: string;
}

export type LandingBlock =
  | {
      type: "hero";
      heading: string;
      subheading?: string;
      bullets?: Array<string>;
      form: LandingForm;
    }
  | {
      type: "text";
      heading?: string;
      body: string;
      points?: Array<string>;
      closing?: string;
    }
  | {
      type: "steps";
      heading?: string;
      items: Array<{ title: string; body: string }>;
      closing?: string;
    }
  | {
      type: "features";
      heading?: string;
      items: Array<{ title: string; body?: string }>;
    }
  | {
      type: "myths";
      heading?: string;
      items: Array<{ myth: string; answer: string }>;
    }
  | {
      type: "services";
      heading?: string;
      items: Array<string | LandingCard>;
      tagline?: string;
    }
  | {
      type: "testimonials";
      heading?: string;
      items: Array<{ quote: string; name: string; role?: string }>;
      badges?: Array<string | LandingCard>;
    }
  | {
      type: "comparison";
      heading?: string;
      columns: [string, string];
      rows: Array<{ label: string; values: [string, string] }>;
    }
  | {
      type: "faq";
      heading?: string;
      items: Array<{ question: string; answer: string }>;
    }
  | { type: "leadForm"; heading: string; body?: string; form: LandingForm }
  | { type: "cta"; heading: string; body?: string; label: string };

export const LANDING_BLOCK_TYPES = [
  "hero",
  "text",
  "steps",
  "features",
  "myths",
  "services",
  "testimonials",
  "comparison",
  "faq",
  "leadForm",
  "cta",
] as const;

const MAX_BLOCKS = 14;

/**
 * Validates a page's sections. A page opens with one hero and has exactly one closing lead form
 * (leadForm), which every call to action scrolls to.
 */
export function parseLandingBlocks(raw: unknown): {
  blocks: Array<LandingBlock>;
  problems: Array<string>;
} {
  const problems: Array<string> = [];
  const list = Array.isArray(raw) ? raw : [];
  if (list.length === 0) {
    problems.push("blocks ריק");
  }
  if (list.length > MAX_BLOCKS) {
    problems.push(`יותר מ-${MAX_BLOCKS} מקטעים בעמוד`);
  }
  const blocks = list
    .slice(0, MAX_BLOCKS)
    .map((entry, index) =>
      parseBlock(record(entry), `מקטע ${index + 1}`, problems),
    )
    .filter((entry): entry is LandingBlock => entry !== null);
  if (blocks.length > 0 && blocks[0].type !== "hero") {
    problems.push("המקטע הראשון חייב להיות hero");
  }
  if (blocks.filter((entry) => entry.type === "hero").length > 1) {
    problems.push("רק hero אחד בעמוד");
  }
  if (blocks.filter((entry) => entry.type === "leadForm").length !== 1) {
    problems.push("צריך מקטע leadForm אחד בדיוק, בסוף העמוד");
  }
  return { blocks, problems };
}
