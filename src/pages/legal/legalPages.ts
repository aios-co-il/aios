/** A public legal page that is also written to the build as static HTML. */
export interface LegalPage {
  path: "/privacy" | "/terms" | "/data-deletion";
  title: string;
  description: string;
}

export const LEGAL_PAGES: ReadonlyArray<LegalPage> = [
  {
    path: "/privacy",
    title: "מדיניות פרטיות | AIOS",
    description:
      "מדיניות הפרטיות של AIOS: איזה מידע אנו אוספים, כיצד אנו משתמשים בו, שומרים ומגנים עליו, וכיצד לבקש את מחיקתו.",
  },
  {
    path: "/terms",
    title: "תנאי שימוש | AIOS",
    description: "תנאי השימוש בפלטפורמת AIOS ובשירותים הנלווים לה.",
  },
  {
    path: "/data-deletion",
    title: "מחיקת מידע | AIOS",
    description:
      "כיצד לבקש מחיקה של המידע ש-AIOS שומרת מאינטגרציות Meta (Facebook, Instagram) ו-Google.",
  },
];

const ROOT_ELEMENT = '<div id="root"></div>';

/**
 * Builds a page's static HTML from the built index.html: the rendered page goes
 * inside #root, and the title and description describe that page.
 */
export function injectStaticPage(
  template: string,
  page: LegalPage,
  markup: string,
): string {
  if (!template.includes(ROOT_ELEMENT)) {
    throw new Error(`index.html has no ${ROOT_ELEMENT} to render into`);
  }

  const title = escapeAttribute(page.title);
  const description = escapeAttribute(page.description);

  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${description}" />`,
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${title}" />`,
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${description}" />`,
    )
    .replace(ROOT_ELEMENT, `<div id="root">${markup}</div>`);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
