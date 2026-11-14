import { en } from "./en";
import { hi, type DictKey } from "./hi";
import type { Lang } from "./lang";

export type Dict = Record<DictKey, string>;

const dicts: Record<Lang, Dict> = { hi, en };

export function getDict(lang: Lang): Dict {
  return dicts[lang];
}

export type { DictKey };
