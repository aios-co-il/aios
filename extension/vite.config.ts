import { defineConfig } from "vite";
import { resolve } from "path";
import {
  resolveBuildEnvironment,
  type BuildEnvironment,
} from "./build/environment";
import { manifestPlugin } from "./build/manifest";

export default defineConfig(({ mode }) => {
  const environment = resolveBuildEnvironment(mode);

  return {
    // Don't inherit the repo-root postcss.config.js (tailwind) — plain CSS here.
    css: { postcss: {} },
    // src/config.ts reads these; they hold the resolved values whatever the shell or a local env file says.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        environment.supabaseUrl,
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        environment.publishableKey,
      ),
      "import.meta.env.VITE_APP_ORIGIN": JSON.stringify(environment.appOrigin),
    },
    plugins: [manifestPlugin(environment)],
    build: {
      outDir: outDir(environment),
      emptyOutDir: true,
      target: "chrome110",
      rollupOptions: {
        input: {
          popup: resolve(__dirname, "popup.html"),
          recorder: resolve(__dirname, "recorder.html"),
          sidepanel: resolve(__dirname, "sidepanel.html"),
        },
      },
    },
  };
});

/** Production keeps the folder Chrome already loads it from; any other environment builds beside it. */
function outDir(environment: BuildEnvironment): string {
  return environment.name === "production"
    ? "dist"
    : `dist-${environment.name}`;
}
