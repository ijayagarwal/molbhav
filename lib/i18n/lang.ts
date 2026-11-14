// The UI language lives in the `lang` cookie and is read on the server (DECISIONS F8). Hindi is the default.

export const LANGS = ["hi", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "hi";
export const LANG_COOKIE = "lang";

export function parseLang(value: string | null | undefined): Lang {
  return value === "en" || value === "hi" ? value : DEFAULT_LANG;
}
