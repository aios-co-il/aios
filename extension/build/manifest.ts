import type { Plugin } from "vite";
import { TAB_SHARING_PERMISSION } from "../src/activeTab";
import { GRANTABLE_SITES } from "../src/device/siteGrant";
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
export function extensionManifest(
  environment: BuildEnvironment,
): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: environment.name === "production" ? NAME : `${NAME} (Staging)`,
    description:
      "Record meetings into the AIOS recordings library with automatic transcription and summary",
    version: "1.3",
    // The panel's newest API: URL.canParse, in the tab parser it shares with the site.
    minimum_chrome_version: "120",
    // Fixes an unpacked build's id, which the site's framing rule (vercel.json) names.
    key: EXTENSION_PUBLIC_KEYS[environment.name],
    action: {
      default_popup: "popup.html",
      default_icon: TOOLBAR_ICONS,
    },
    // Carmen's panel; the popup's button opens it, so the toolbar icon keeps opening the popup.
    side_panel: { default_path: "sidepanel.html" },
    // `scripting` reads a page for Carmen, and only on a site the user granted from the panel.
    permissions: ["storage", "sidePanel", "scripting"],
    // Asked for from the panel's "Carmen sees the tab" switch.
    optional_permissions: [TAB_SHARING_PERMISSION],
    // One site at a time, from a tap on the panel's card; none at install.
    optional_host_permissions: [GRANTABLE_SITES],
    // The app's origin makes Chrome treat the framed site as first-party, so the user's
    // sign-in on the site also holds inside the panel.
    host_permissions: [
      ...environment.supabaseOrigins,
      environment.appOrigin,
    ].map((origin) => `${origin}/*`),
    icons: { ...TOOLBAR_ICONS, "128": "icons/icon128.png" },
  };
}
