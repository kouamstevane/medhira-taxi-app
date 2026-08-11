import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactPlugin from "eslint-plugin-react";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".firebase/**",
      ".github/**",
      ".idea/**",
      ".kilo/**",
      ".kilocode/**",
      ".next/**",
      ".next-mobile/**",
      ".opencode/**",
      ".planning/**",
      ".playwright-mcp/**",
      ".stitch/**",
      ".superpowers/**",
      ".swc/**",
      ".trae/**",
      ".vscode/**",
      "out/**",
      "build/**",
      "functions/lib/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "test-reports/**",
      "android/**",
      "ios/**",
      ".worktrees/**",
      "next-env.d.ts",
    ],
  },
  {
    plugins: {
      react: reactPlugin,
    },
    rules: {
      "react/no-unescaped-entities": [
        "error",
        { forbid: [">", "}"] },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: [
      "**/__tests__/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-var": "off",
    },
  },
];

export default eslintConfig;
