import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
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
      "no-empty": "warn", // AIO-53
      "no-case-declarations": "warn", // AIO-56
      "@typescript-eslint/ban-ts-comment": "warn", // AIO-57
      "react-hooks/rules-of-hooks": "warn", // AIO-61
      "@typescript-eslint/no-require-imports": "warn", // AIO-63
      "no-constant-binary-expression": "warn", // AIO-65
    },
  },
);
