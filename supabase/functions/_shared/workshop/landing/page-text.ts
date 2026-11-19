import { plainShownText } from "./kind.ts";
import type { LandingBlock, LandingCard, LandingForm } from "./page-content.ts";

/** The page as readable text, section by section, for the board and for Carmen's reply. */
export function landingCopyText(blocks: Array<LandingBlock>): string {
  return plainShownText(blocks.map(blockText).join("\n\n———\n\n"));
}

/** One section as readable text. */
function blockText(entry: LandingBlock): string {
  const lines: Array<string> = entry.heading ? [entry.heading] : [];
  switch (entry.type) {
    case "hero":
      push(lines, entry.subheading);
      lines.push(...(entry.bullets ?? []).map((bullet) => `✓ ${bullet}`));
      lines.push(formText(entry.form));
      break;
    case "text":
      lines.push(entry.body);
      lines.push(...(entry.points ?? []).map((point) => `✕ ${point}`));
      push(lines, entry.closing);
      if (entry.cta) {
        lines.push(`[כפתור: ${entry.cta.label}]`);
      }
      break;
    case "steps":
      entry.items.forEach((item, index) =>
        lines.push(`${index + 1}. ${item.title}: ${item.body}`),
      );
      push(lines, entry.closing);
      break;
    case "features":
      for (const item of entry.items) {
        lines.push(cardText(item));
      }
      break;
    case "myths":
      for (const item of entry.items) {
        lines.push(`מיתוס: ${item.myth}\nבפועל: ${item.answer}`);
      }
      break;
    case "services":
      lines.push(entry.items.map(cardText).join("\n"));
      push(lines, entry.tagline);
      break;
    case "testimonials":
      lines.push(...(entry.badges ?? []).map(cardText));
      for (const item of entry.items) {
        lines.push(
          `"${item.quote}"\n${item.name}${item.role ? `, ${item.role}` : ""}`,
        );
      }
      break;
    case "comparison":
      lines.push(`| | ${entry.columns[0]} | ${entry.columns[1]} |`);
      for (const row of entry.rows) {
        lines.push(`| ${row.label} | ${row.values[0]} | ${row.values[1]} |`);
      }
      break;
    case "faq":
      for (const item of entry.items) {
        lines.push(`ש: ${item.question}\nת: ${item.answer}`);
      }
      break;
    case "leadForm":
      push(lines, entry.body);
      lines.push(formText(entry.form));
      break;
    case "cta":
      push(lines, entry.body);
      lines.push(`[כפתור: ${entry.label}]`);
      break;
  }
  return lines.join("\n");
}

/** Adds a line when it has text. */
function push(lines: Array<string>, line: string | undefined) {
  if (line) {
    lines.push(line);
  }
}

/** A card as a bullet: its title, and its explanation after a colon. */
function cardText(item: string | LandingCard): string {
  if (typeof item === "string") {
    return `• ${item}`;
  }
  return item.body ? `• ${item.title}: ${item.body}` : `• ${item.title}`;
}

/** What the extra form fields are called on the page. */
const FIELD_NAMES = { companyName: "שם החברה", employees: "מספר עובדים" };

/** A lead form as the reader sees it: its fields, its button and what it answers. */
function formText(form: LandingForm): string {
  const fields = [
    "שם",
    "טלפון",
    ...(form.fields ?? []).map((field) => FIELD_NAMES[field]),
  ];
  const note = form.privacyNote ? `\n${form.privacyNote}` : "";
  return `[טופס: ${fields.join(", ")} · ${form.buttonLabel}]${note}\nאחרי שליחה: ${form.successMessage}`;
}
