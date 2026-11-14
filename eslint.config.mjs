import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // CLAUDE.md hard rule 6: public Convex functions are built only with the guarded builders in
    // convex/lib/functions.ts, which run the access check before the handler.
    files: ["convex/**/*.ts"],
    ignores: ["convex/lib/functions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "_generated/server$",
              importNames: ["query", "mutation", "action"],
              message:
                "Use userQuery/contractorQuery/adminQuery (and the mutation twins) from convex/lib/functions.ts; internal* builders are fine.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "convex/_generated/**",
    ".venv/**",
    ".claude/**",
    "design/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
