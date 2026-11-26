import type { Plugin } from "vite";
import type { BuildEnvironment } from "./environment";
import { EXTENSION_PUBLIC_KEYS } from "./extensionKey";

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
    // Fixes the extension's id, which the site's framing rule (vercel.json) names.
    key: EXTENSION_PUBLIC_KEYS[environment.name],
    action: {
      default_popup: "popup.html",
      default_icon: TOOLBAR_ICONS,
    },
    // Carmen's panel; the popup's button opens it, so the toolbar icon keeps opening the popup.
    side_panel: { default_path: "sidepanel.html" },
    permissions: ["storage", "sidePanel"],
    // Asked for from the panel's "Carmen sees the tab" switch (src/activeTab.ts).
    optional_permissions: ["tabs"],
    // The app's origin makes Chrome treat the framed site as first-party, so the user's
    // sign-in on the site also holds inside the panel.
    host_permissions: [
      ...environment.supabaseOrigins,
      environment.appOrigin,
    ].map((origin) => `${origin}/*`),
    icons: { ...TOOLBAR_ICONS, "128": "icons/icon128.png" },
  };
}
