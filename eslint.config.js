import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import astro from "eslint-plugin-astro";
import jsx from "eslint-plugin-jsx-a11y";

export default [
  js.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@typescript-eslint": typescript },
    languageOptions: { parser: typescriptParser },
    rules: typescript.configs.recommended.rules,
  },
  {
    files: ["**/*.{jsx,tsx,astro}"],
    plugins: { "jsx-a11y": jsx },
    rules: jsx.configs.recommended.rules,
  },
  {
    ignores: ["dist/**", "node_modules/**", ".astro/**"],
  },
];
