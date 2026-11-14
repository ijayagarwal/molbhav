import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// cn() for shadcn/ui primitives and our components, taught our design tokens (app/globals.css) so it
// merges text-title-1 vs text-ink, shadow-paint vs shadow-none, rounded-card vs rounded-parchi correctly.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["price-hero", "title-1", "title-2", "body-lg", "body", "label", "meta", "ledger"],
      shadow: ["paint-sm", "paint", "paint-lg"],
      radius: ["card", "parchi", "sheet"],
      color: ["paper", "card", "cement", "rule", "ink", "ink-2", "ink-3", "haldi", "lal", "hara", "neel", "on-lal", "paint-shadow"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
