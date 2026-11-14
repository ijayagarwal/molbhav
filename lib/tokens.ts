// Design tokens (docs/DESIGN.md §5, D1, D2). The one TypeScript source of the colour values; app/globals.css
// mirrors them as CSS variables, and lib/tokens.test.ts fails if the two drift. Components never use hex
// values: they use the Tailwind utilities generated from globals.css (bg-paper, text-ink, …).

export const LIGHT = {
  paper: "#F6F2E9",
  card: "#FFFFFF",
  cement: "#E9E3D7",
  rule: "#D8D0C2",
  ink: "#15120E",
  "ink-2": "#45403A",
  "ink-3": "#6B6358",
  haldi: "#FFC61A",
  lal: "#93180F",
  hara: "#115533",
  neel: "#1E3A8A",
  "paint-shadow": "#15120E",
  "on-lal": "#FFFFFF",
} as const;

/** "Raat ki shift" (P1): defined now, not exposed in the UI yet (D1). */
export const DARK: Record<keyof typeof LIGHT, string> = {
  paper: "#14110D",
  card: "#1F1B16",
  cement: "#2A251E",
  rule: "#3A332A",
  ink: "#F6F2E9",
  "ink-2": "#CFC6B8",
  "ink-3": "#A39A8C",
  haldi: "#FFC61A",
  lal: "#FF8A7A",
  hara: "#6FD39B",
  neel: "#9DB4FF",
  "paint-shadow": "#7A5A00",
  "on-lal": "#14110D",
};

export type ColorToken = keyof typeof LIGHT;

/** WCAG 2 relative luminance of an sRGB hex colour. */
export function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colours, e.g. 16.7 for ink on paper. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The pairs DESIGN.md §5 measures, with the minimum each must meet (7:1 for prices and primary text). */
export const CONTRAST_PAIRS: ReadonlyArray<{ fg: ColorToken; bg: ColorToken; min: number; use: string }> = [
  { fg: "ink", bg: "paper", min: 7, use: "prices, primary text" },
  { fg: "ink", bg: "card", min: 7, use: "prices, primary text" },
  { fg: "ink-2", bg: "paper", min: 7, use: "secondary text" },
  { fg: "ink-3", bg: "paper", min: 4.5, use: "hints only" },
  { fg: "lal", bg: "paper", min: 7, use: "strike, warnings" },
  { fg: "lal", bg: "card", min: 7, use: "strike, warnings" },
  { fg: "hara", bg: "paper", min: 7, use: "savings" },
  { fg: "hara", bg: "card", min: 7, use: "savings" },
  { fg: "neel", bg: "paper", min: 7, use: "on-call, links" },
  { fg: "ink", bg: "haldi", min: 7, use: "button text" },
  { fg: "on-lal", bg: "lal", min: 7, use: "text on lal" },
];
