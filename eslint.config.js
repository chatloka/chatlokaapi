import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const tsFiles = ["**/*.{ts,tsx}"];
const jsFiles = ["**/*.{js,jsx}"];

export default [
  { ignores: ["dist", "node_modules", "scripts", "migrations"] },
  {
    files: tsFiles,
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        // Cloudflare Workers globals
        D1Database: "readonly",
        R2Bucket: "readonly",
        RateLimit: "readonly",
        // Node.js globals for config files
        __dirname: "readonly",
        __filename: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off", // TypeScript handles this
      "react/jsx-no-target-blank": "off",
      "react/react-in-jsx-scope": "off", // React 19 doesn't need import
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    files: jsFiles,
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        __dirname: "readonly",
        __filename: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/jsx-no-target-blank": "off",
      "react/react-in-jsx-scope": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    files: ["**/vite.config.ts", "**/vite.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
];
