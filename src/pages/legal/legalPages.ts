/** A public legal page that is also written to the build as static HTML. */
export interface LegalPage {
  path: "/privacy" | "/terms" | "/data-deletion";
  title: string;
  description: string;
  /** Date this page's text last changed; update with policy text changes. */
  lastUpdated: string;
}

/** The app's own title from index.html, restored when leaving a legal page. */
export const DEFAULT_DOCUMENT_TITLE = "AIOS | כל השיווק והמכירות במקום אחד";

export const PRIVACY_PAGE: LegalPage = {
  path: "/privacy",
  lastUpdated: "18.11.2026",
  title: "מדיניות פרטיות | AIOS",
  description:
    "מדיניות הפרטיות של AIOS: איזה מידע אנו אוספים, כיצד אנו משתמשים בו, שומרים ומגנים עליו, וכיצד לבקש את מחיקתו.",
};

export const TERMS_PAGE: LegalPage = {
  path: "/terms",
  lastUpdated: "18.11.2026",
  title: "תנאי שימוש | AIOS",
  description: "תנאי השימוש בפלטפורמת AIOS ובשירותים הנלווים לה.",
};

export const DATA_DELETION_PAGE: LegalPage = {
  path: "/data-deletion",
  lastUpdated: "18.11.2026",
  title: "מחיקת מידע | AIOS",
  description:
    "כיצד לבקש מחיקה של המידע ש-AIOS שומרת מאינטגרציות Meta (Facebook, Instagram) ו-Google.",
};

export const LEGAL_PAGES: ReadonlyArray<LegalPage> = [
  PRIVACY_PAGE,
  TERMS_PAGE,
  DATA_DELETION_PAGE,
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

  const head = [
    replaceTag(/<title>[^<]*<\/title>/, `<title>${title}</title>`),
    replaceTag(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${description}" />`,
    ),
    replaceTag(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${title}" />`,
    ),
    replaceTag(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${description}" />`,
    ),
  ].reduce((html, replace) => replace(html), template);

  // A callback keeps "$" sequences in the rendered page literal.
  return head.replace(ROOT_ELEMENT, () => `<div id="root">${markup}</div>`);
}

/**
 * Replaces a head tag the page overrides. Throws when index.html no longer has
 * it, so a changed template cannot silently publish the app's generic head.
 */
function replaceTag(pattern: RegExp, tag: string): (html: string) => string {
  return (html) => {
    if (!pattern.test(html)) {
      throw new Error(`index.html has no tag matching ${pattern}`);
    }

    return html.replace(pattern, () => tag);
  };
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
