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
    // The Astro landing site (T-184) has its own toolchain. A local build writes
    // generated declarations under apps/landing/.astro that this Next.js config
    // was never meant to lint, and they failed it with seven errors.
    "apps/landing/**",
  ]),
]);

export default eslintConfig;
