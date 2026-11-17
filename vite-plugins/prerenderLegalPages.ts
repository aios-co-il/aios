import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServer, type Plugin } from "vite";
import {
  injectStaticPage,
  LEGAL_PAGES,
} from "../src/pages/legal/legalPages.ts";

const PRERENDER_ENTRY = "/src/pages/legal/prerender.tsx";

/**
 * After `vite build`, writes /privacy, /terms and /data-deletion as static
 * HTML. Meta's and Google's review crawlers do not run JavaScript, so without
 * this they see the empty SPA shell instead of the policy text. Vercel serves
 * these files before its SPA rewrite; the app still renders over them.
 */
export function prerenderLegalPages(): Plugin {
  let root = process.cwd();
  let outDir = "dist";

  return {
    name: "prerender-legal-pages",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const template = readFileSync(path.join(outDir, "index.html"), "utf8");
        const server = await createServer({
          root,
          mode: "production",
          logLevel: "error",
          appType: "custom",
          server: { middlewareMode: true, hmr: false },
          optimizeDeps: { noDiscovery: true, include: [] },
        });

        try {
          const entry = await server.ssrLoadModule(PRERENDER_ENTRY);
          for (const page of LEGAL_PAGES) {
            const markup = entry.renderLegalPage(page.path);
            if (typeof markup !== "string" || markup.length === 0) {
              throw new Error(`Rendering ${page.path} returned no HTML`);
            }
            const pageDir = path.join(outDir, page.path);
            mkdirSync(pageDir, { recursive: true });
            writeFileSync(
              path.join(pageDir, "index.html"),
              injectStaticPage(template, page, markup),
            );
          }
        } finally {
          await server.close();
        }
      },
    },
  };
}
