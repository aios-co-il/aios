import { describe, expect, test } from "vitest";
import { injectStaticPage, LEGAL_PAGES } from "./legalPages";

describe("injectStaticPage", () => {
  test("puts the page in #root and describes it in the head", () => {
    const html = injectStaticPage(TEMPLATE, PRIVACY, "<main>policy</main>");

    expect(html).toContain('<div id="root"><main>policy</main></div>');
    expect(html).toContain("<title>מדיניות פרטיות | AIOS</title>");
    expect(html).toContain(
      `<meta name="description" content="${PRIVACY.description}" />`,
    );
    expect(html).toContain(
      '<meta property="og:title" content="מדיניות פרטיות | AIOS" />',
    );
    expect(html).not.toContain("old title");
    expect(html).toContain(
      '<script type="module" src="/assets/index.js"></script>',
    );
  });

  test("escapes quotes in the head", () => {
    const page = { ...PRIVACY, title: 'A "quoted" title' };

    const html = injectStaticPage(TEMPLATE, page, "");

    expect(html).toContain('content="A &quot;quoted&quot; title"');
  });

  test("fails when index.html has no root element", () => {
    expect(() => injectStaticPage("<html></html>", PRIVACY, "")).toThrow(
      "index.html has no",
    );
  });
});

describe("LEGAL_PAGES", () => {
  test("covers the pages linked from the homepage footer", () => {
    expect(LEGAL_PAGES.map((page) => page.path)).toEqual([
      "/privacy",
      "/terms",
      "/data-deletion",
    ]);
  });
});

describe("injectStaticPage text handling", () => {
  test("keeps dollar sequences in the rendered page literal", () => {
    const html = injectStaticPage(TEMPLATE, PRIVACY, "<p>$$ and $&</p>");

    expect(html).toContain('<div id="root"><p>$$ and $&</p></div>');
  });

  test("fails when index.html has no description tag to override", () => {
    const template = TEMPLATE.replace(/<meta\s+name="description"[^>]*>/, "");

    expect(() => injectStaticPage(template, PRIVACY, "")).toThrow(
      "index.html has no tag matching",
    );
  });
});

const PRIVACY = LEGAL_PAGES[0];

const TEMPLATE = `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <title>old title</title>
    <meta
      name="description"
      content="old description"
    />
    <meta property="og:title" content="old title" />
    <meta
      property="og:description"
      content="old og description"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;
