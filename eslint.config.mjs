import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static design-reference package (hand-authored prototype, not app code).
    "handoff/**",
    // Claude Code worktrees/session files — never lintable app code, and stray
    // worktrees were failing `eslint .` (and with it `npm run gate`).
    ".claude/**",
  ]),
]);

export default eslintConfig;
