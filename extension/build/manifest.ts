import type { Plugin } from "vite";
import type { BuildEnvironment } from "./environment";

const NAME = "AIOS Rec";

const TOOLBAR_ICONS = {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
};

/** Writes manifest.json into the build, so its host permissions follow the addresses the code calls. */
export function manifestPlugin(environment: BuildEnvironment): Plugin {
  return {
    name: "aios-extension-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(extensionManifest(environment), null, 2)}\n`,
      });
    },
  };
}

/** The manifest of one environment's build. A Staging build is named apart so both can be loaded in one Chrome. */
function extensionManifest(
  environment: BuildEnvironment,
): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: environment.name === "production" ? NAME : `${NAME} (Staging)`,
    description:
      "Record meetings into the AIOS recordings library with automatic transcription and summary",
    version: "1.0",
    action: {
      default_popup: "popup.html",
      default_icon: TOOLBAR_ICONS,
    },
    permissions: ["storage"],
    host_permissions: environment.supabaseOrigins.map(
      (origin) => `${origin}/*`,
    ),
    icons: { ...TOOLBAR_ICONS, "128": "icons/icon128.png" },
  };
}
