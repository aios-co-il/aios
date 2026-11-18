import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  DATA_DELETION_PAGE,
  DEFAULT_DOCUMENT_TITLE,
  injectStaticPage,
  LEGAL_LAST_UPDATED,
  LEGAL_PAGES,
  PRIVACY_PAGE,
  TERMS_PAGE,
} from "./legalPages";
import { renderLegalPage } from "./prerender";

describe("renderLegalPage", () => {
  test.each([
    { page: PRIVACY_PAGE, heading: "מדיניות פרטיות" },
    { page: TERMS_PAGE, heading: "תנאי שימוש" },
    { page: DATA_DELETION_PAGE, heading: "מחיקת מידע" },
  ])("renders $page.path with its policy text", ({ page, heading }) => {
    const markup = renderLegalPage(page.path);

    expect(markup).toContain(heading);
    expect(markup).toContain("AIOS");
    expect(markup).toContain(LEGAL_LAST_UPDATED);
  });

  test("each page fits into the real index.html", () => {
    for (const page of LEGAL_PAGES) {
      const html = injectStaticPage(
        INDEX_HTML,
        page,
        renderLegalPage(page.path),
      );

      expect(html).toContain(`<title>${page.title}</title>`);
      expect(html).not.toContain('<div id="root"></div>');
    }
  });

  test("the default title matches index.html", () => {
    expect(INDEX_HTML).toContain(`<title>${DEFAULT_DOCUMENT_TITLE}</title>`);
  });
});

const INDEX_HTML = readFileSync(
  path.resolve(__dirname, "../../../index.html"),
  "utf8",
);
