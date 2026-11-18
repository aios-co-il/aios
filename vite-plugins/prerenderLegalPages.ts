import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createServer,
  type Alias,
  type Plugin,
  type ViteDevServer,
} from "vite";
import { z } from "zod";
import {
  injectStaticPage,
  LEGAL_PAGES,
  type LegalPage,
} from "../src/pages/legal/legalPages.ts";

const PRERENDER_ENTRY = "/src/pages/legal/prerender.tsx";

const prerenderEntrySchema = z.object({
  renderLegalPage: z.function().args(z.string()).returns(z.string().min(1)),
});

type RenderLegalPage = z.infer<typeof prerenderEntrySchema>["renderLegalPage"];

interface RendererConfig {
  root: string;
  alias: Alias[];
  define: Record<string, unknown>;
}

/**
 * After `vite build`, writes /privacy, /terms and /data-deletion as static
 * HTML. Meta's and Google's review crawlers do not run JavaScript, so without
 * this they see the empty SPA shell instead of the policy text. Vercel serves
 * these files before its SPA rewrite; the app still renders over them.
 */
export function prerenderLegalPages(): Plugin {
  let outDir = "dist";
  let rendererConfig: RendererConfig = {
    root: process.cwd(),
    alias: [],
    define: {},
  };

  return {
    name: "prerender-legal-pages",
    apply: (_config, env) => env.command === "build" || env.isPreview === true,
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      rendererConfig = {
        root: config.root,
        alias: config.resolve.alias,
        define: config.define ?? {},
      };
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? "").split("?");
        const page = LEGAL_PAGES.find(
          (page) => pathname === page.path || pathname === page.path + "/",
        );
        if (page) {
          req.url =
            page.path +
            "/index.html" +
            (query === undefined ? "" : "?" + query);
        }
        next();
      });
    },
    writeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const template = readFileSync(path.join(outDir, "index.html"), "utf8");
        const server = await createRendererServer(rendererConfig);

        try {
          const renderLegalPage = await loadRenderer(server);
          for (const page of LEGAL_PAGES) {
            writeLegalPage(
              outDir,
              page,
              injectStaticPage(template, page, renderLegalPage(page.path)),
            );
          }
        } finally {
          await server.close();
        }
      },
    },
  };
}

/**
 * The app config's SWC plugin emits dev-only jsxDEV calls in server mode, which
 * React's production runtime does not export, so the renderer gets its own
 * config with the app's aliases and defines and esbuild's production JSX.
 */
function createRendererServer(config: RendererConfig): Promise<ViteDevServer> {
  return createServer({
    root: config.root,
    configFile: false,
    mode: "production",
    resolve: { alias: config.alias, dedupe: ["react", "react-dom"] },
    define: config.define,
    esbuild: { jsx: "automatic", jsxDev: false },
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
}

async function loadRenderer(server: ViteDevServer): Promise<RenderLegalPage> {
  const entry = prerenderEntrySchema.parse(
    await server.ssrLoadModule(PRERENDER_ENTRY),
  );

  return entry.renderLegalPage;
}

function writeLegalPage(outDir: string, page: LegalPage, html: string): void {
  const pageDir = path.join(outDir, page.path);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(path.join(pageDir, "index.html"), html);
}
