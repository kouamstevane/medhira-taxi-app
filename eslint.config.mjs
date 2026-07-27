import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
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
];

export default eslintConfig;
