import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LEGAL_PAGES, LEGAL_LAST_UPDATED } from "../src/pages/legal/legalPages";

describe("prerenderLegalPages production build", () => {
  test("emits every legal document with its title and policy text", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "legal-build-"));
    try {
      execFileSync("pnpm", ["build", "--outDir", outDir], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        stdio: "pipe",
        timeout: 240_000,
      });
      const policyText = {
        "/privacy": "מידע שאנו אוספים",
        "/terms": "ניהול לקוחות, לידים ומשימות",
        "/data-deletion": "Data Deletion Instructions (English)",
      };
      for (const page of LEGAL_PAGES) {
        const html = readFileSync(
          path.join(outDir, page.path, "index.html"),
          "utf8",
        );
        expect(html).toContain(`<title>${page.title}</title>`);
        expect(html).toContain(policyText[page.path]);
        expect(html).toContain(LEGAL_LAST_UPDATED);
        expect(html).not.toContain('<div id="root"></div>');
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 250_000);
});
