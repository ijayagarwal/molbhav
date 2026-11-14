// Fonts (DECISIONS D3, docs/DESIGN.md §6): static subsets from scripts/fonts.py via next/font/local.
// Only Mukta 400 and the width-125 digits file are preloaded; everything else swaps in.
// Each weight is its own family so the browser never synthesises bold (font-synthesis: none);
// globals.css maps .text-label / .font-ui-semibold to the 600 family.
import localFont from "next/font/local";

export const mukta = localFont({
  src: "./fonts/mukta-400.woff2",
  weight: "400",
  variable: "--font-mukta",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
});

export const mukta600 = localFont({
  src: "./fonts/mukta-600.woff2",
  weight: "600",
  variable: "--font-mukta-600",
  display: "swap",
  preload: false,
  fallback: ["system-ui", "sans-serif"],
});

export const anek = localFont({
  src: "./fonts/anek-700.woff2",
  weight: "700",
  variable: "--font-anek",
  display: "swap",
  preload: false,
  fallback: ["system-ui", "sans-serif"],
});

export const digits125 = localFont({
  src: "./fonts/anek-digits-800-w125.woff2",
  weight: "800",
  variable: "--font-digits-125",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
});

export const digits112 = localFont({
  src: "./fonts/anek-digits-800-w112.woff2",
  weight: "800",
  variable: "--font-digits-112",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const digits100 = localFont({
  src: "./fonts/anek-digits-800-w100.woff2",
  weight: "800",
  variable: "--font-digits-100",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const plexMono = localFont({
  src: [
    { path: "./fonts/plexmono-500.woff2", weight: "500" },
    { path: "./fonts/plexmono-600.woff2", weight: "600" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
});

/** All font variables, for <html className>. */
export const fontVariables = [mukta, mukta600, anek, digits125, digits112, digits100, plexMono]
  .map((f) => f.variable)
  .join(" ");
