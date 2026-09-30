import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { omitted: _omitted, ...rest } = obj` is the idiom used to drop
      // optional columns before retrying an insert/update against an older schema.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true, varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not part of the where-2-run app: a separate project's source and build
    // output, other projects' build folders, and SQL migrations.
    "household-ops/**",
    "**/.next/**",
    "dist/**",
    "supabase/**",
  ]),
]);

export default eslintConfig;
