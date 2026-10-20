import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    rules: {
      "max-lines": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
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
      "@typescript-eslint/no-unused-vars": "off",
      // Temporary warning overrides; remove each after its linked AIO-26 cleanup.
      "@typescript-eslint/no-explicit-any": "warn", // AIO-52
      "react-hooks/rules-of-hooks": "error", // AIO-61
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
