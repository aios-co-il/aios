import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const REPLY_MARKDOWN_ONLY =
  "Render Markdown with ReplyMarkdown (src/components/ReplyMarkdown).";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".local",
      "src/integrations/supabase/types.ts",
      "supabase/functions/_shared/database.types.ts",
    ],
  },
  {
    rules: {
      curly: "error",
      "func-style": ["warn", "declaration", { allowArrowFunctions: false }],
      "max-lines": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "no-unneeded-ternary": "warn",
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/unified-signatures": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/array-type": ["error", { default: "generic" }],
      // Temporary warning overrides; remove each after its linked AIO-26 cleanup.
      "@typescript-eslint/no-explicit-any": "warn", // AIO-52
    },
  },
  {
    // Model-written Markdown has one renderer, which decides what an image may load (AIO-665).
    // A renderer written by hand, with no Markdown library, is outside what this can catch.
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/components/ReplyMarkdown/ReplyMarkdown.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react-markdown", message: REPLY_MARKDOWN_ONLY }],
          patterns: [
            { group: ["react-markdown/*"], message: REPLY_MARKDOWN_ONLY },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^react-markdown(\\/|$)/]",
          message: REPLY_MARKDOWN_ONLY,
        },
      ],
    },
  },
  {
    files: [
      "**/*.{test,spec}.{js,mjs,cjs,jsx,ts,tsx}",
      "**/{__tests__,tests}/**/*.{js,mjs,cjs,jsx,ts,tsx}",
    ],
    rules: {
      "max-lines": [
        "warn",
        { max: 250, skipBlankLines: true, skipComments: true },
      ],
    },
  },
);
