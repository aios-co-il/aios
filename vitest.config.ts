import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@functions": fileURLToPath(
        new URL("./supabase/functions", import.meta.url),
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    clearMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "frontend",
          environment: "happy-dom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "render-worker/test/**/*.test.mjs",
            "scripts/**/*.test.mjs",
            ".github/scripts/**/*.test.mjs",
          ],
        },
      },
    ],
  },
});
