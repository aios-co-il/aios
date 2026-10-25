import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    // Keep node:test suites on their existing runner.
    include: [
      "src/**/*.test.tsx",
      "src/lib/carmenSkinPortraits.test.ts",
      "src/lib/clientConnectionProvision.test.ts",
      "src/lib/commandCenterAttachments.test.ts",
      "src/lib/crmTableCategories.test.ts",
      "src/lib/seoKeywordClusters.test.ts",
      "src/lib/seoMonthlyPdfArchive.test.ts",
    ],
    clearMocks: true,
  },
});
