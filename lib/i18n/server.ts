import "server-only";
import { cookies } from "next/headers";
import { format } from "./format";
import { getDict, type Dict, type DictKey } from "./getDict";
import { LANG_COOKIE, parseLang, type Lang } from "./lang";

/** The request's UI language, from the `lang` cookie (set by proxy.ts). */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

/** Server components: `const { t, tf, lang } = await getServerDict(); t["home.title"]; tf("sweep.progress", { done, total })`. */
export async function getServerDict(): Promise<{ lang: Lang; t: Dict; tf: (key: DictKey, vars?: Record<string, string | number>) => string }> {
  const lang = await getLang();
  const t = getDict(lang);
  return { lang, t, tf: (key, vars) => format(t[key], vars) };
}
