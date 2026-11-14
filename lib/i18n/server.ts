import "server-only";
import { cookies } from "next/headers";
import { getDict, type Dict } from "./getDict";
import { LANG_COOKIE, parseLang, type Lang } from "./lang";

/** The request's UI language, from the `lang` cookie (set by proxy.ts). */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getServerDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: getDict(lang) };
}
