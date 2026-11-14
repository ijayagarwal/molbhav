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
  {
    // DESIGN §7, D8: shadcn's default shadows and radii fight the painted-paper look, and colours come only
    // from tokens (lib/tokens.ts → globals.css utilities). Our own shadow-paint-* tokens stay allowed.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s|:)(shadow-(sm|md|lg|xl|2xl)|rounded-md|ring-offset-[\\w-]+)(\\s|$)/]",
          message: "shadcn default classes are banned (DESIGN §7): use shadow-paint-*, rounded-card/parchi/sheet and outline focus rings.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\s|:)(shadow-(sm|md|lg|xl|2xl)|rounded-md|ring-offset-[\\w-]+)(\\s|$)/]",
          message: "shadcn default classes are banned (DESIGN §7): use shadow-paint-*, rounded-card/parchi/sheet and outline focus rings.",
        },
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b/]",
          message: "No hard-coded colours (CLAUDE.md hard rule 11): use token utilities (bg-paper, text-ink…) or lib/tokens.ts.",
        },
      ],
    },
  },
  {
    // CLAUDE.md hard rule 10: every user-facing string comes from the dictionary (lib/i18n).
    files: ["app/**/*.tsx", "components/**/*.tsx", "features/**/*.tsx"],
    ignores: ["app/(product)/styleguide/**"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: false, ignoreProps: true, allowedStrings: ["·", "₹", "—", "–", "/", ":", "%", "×", "+", "−", "(", ")", "•"] }],
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
