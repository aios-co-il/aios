import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { preview } from "vite";
import { prerenderLegalPages } from "../../../vite-plugins/prerenderLegalPages";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  DATA_DELETION_PAGE,
  DEFAULT_DOCUMENT_TITLE,
  injectStaticPage,
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
    expect(markup).toContain(page.lastUpdated);
  });

  test("each page fits into the real index.html", () => {
    for (const page of LEGAL_PAGES) {
      const html = injectStaticPage(
        INDEX_HTML,
        page,
        renderLegalPage(page.path),
      );

      expect(html).toContain(`<title>${page.title}</title>`);
      const template = document.createElement("template");
      template.innerHTML = html;
      expect(
        template.content
          .querySelector('meta[name="description"]')
          ?.getAttribute("content"),
      ).toBe(page.description);
      expect(
        template.content
          .querySelector('meta[property="og:title"]')
          ?.getAttribute("content"),
      ).toBe(page.title);
      expect(
        template.content
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content"),
      ).toBe(page.description);
      expect(html).not.toContain('<div id="root"></div>');
    }
  });

  test("the default title matches index.html", () => {
    expect(INDEX_HTML).toContain(`<title>${DEFAULT_DOCUMENT_TITLE}</title>`);
  });
});

describe("legal page preview routing", () => {
  test("serves generated HTML at canonical URLs and keeps the SPA fallback", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "legal-preview-"));
    const outDir = path.join(root, "dist");
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, "index.html"), INDEX_HTML);
    for (const page of LEGAL_PAGES) {
      mkdirSync(path.join(outDir, page.path));
      writeFileSync(
        path.join(outDir, page.path, "index.html"),
        injectStaticPage(INDEX_HTML, page, renderLegalPage(page.path)),
      );
    }

    try {
      const server = await preview({
        configFile: false,
        root,
        plugins: [prerenderLegalPages()],
        preview: { host: "127.0.0.1", port: 0, open: false },
      });
      try {
        const base = server.resolvedUrls?.local[0];
        expect(base).toBeTruthy();
        for (const page of LEGAL_PAGES) {
          for (const suffix of ["", "?source=preview", "/", "/index.html"]) {
            const response = await fetch(new URL(page.path + suffix, base));
            expect(response.status).toBe(200);
            expect(await response.text()).toContain(
              `<title>${page.title}</title>`,
            );
          }
        }
        const fallback = await fetch(new URL("/other-app-route", base));
        expect(fallback.status).toBe(200);
        expect(await fallback.text()).toBe(INDEX_HTML);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const INDEX_HTML = readFileSync(
  path.resolve(__dirname, "../../../index.html"),
  "utf8",
);
