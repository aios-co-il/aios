import { plainShownText } from "./kind.ts";
import type { LandingBlock, LandingForm } from "./page-content.ts";

/** The page as readable text, section by section, for the board and for Carmen's reply. */
export function landingCopyText(blocks: Array<LandingBlock>): string {
  return plainShownText(blocks.map(blockText).join("\n\n———\n\n"));
}

/** One section as readable text. */
function blockText(entry: LandingBlock): string {
  const lines: Array<string> = [];
  if (entry.heading) {
    lines.push(entry.heading);
  }
  switch (entry.type) {
    case "hero":
      if (entry.subheading) {
        lines.push(entry.subheading);
      }
      lines.push(formText(entry.form));
      break;
    case "text":
      lines.push(entry.body);
      break;
    case "features":
      for (const item of entry.items) {
        lines.push(
          item.body ? `• ${item.title}: ${item.body}` : `• ${item.title}`,
        );
      }
      break;
    case "myths":
      for (const item of entry.items) {
        lines.push(`מיתוס: ${item.myth}\nבפועל: ${item.answer}`);
      }
      break;
    case "services":
      lines.push(entry.items.map((item) => `• ${item}`).join("\n"));
      if (entry.tagline) {
        lines.push(entry.tagline);
      }
      break;
    case "faq":
      for (const item of entry.items) {
        lines.push(`ש: ${item.question}\nת: ${item.answer}`);
      }
      break;
    case "leadForm":
      if (entry.body) {
        lines.push(entry.body);
      }
      lines.push(formText(entry.form));
      break;
    case "cta":
      if (entry.body) {
        lines.push(entry.body);
      }
      lines.push(`[כפתור: ${entry.label}]`);
      break;
  }
  return lines.join("\n");
}

/** A lead form as the reader sees it: its fields, its button and what it answers. */
function formText(form: LandingForm): string {
  return `[טופס: שם וטלפון · ${form.buttonLabel}]\nאחרי שליחה: ${form.successMessage}`;
}
