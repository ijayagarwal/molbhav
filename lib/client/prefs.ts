// Per-device preferences (DESIGN §10, §13 V7, §19 WCAG 2.1.4): sounds, the spoken result, single-key
// shortcuts. They live in localStorage because they belong to this device (a shared site phone may want
// sound off), not to the contractor. The UI language is NOT here: it is the server-read `lang` cookie (F8).
import { useSyncExternalStore } from "react";

export interface Prefs {
  sound: boolean;
  spokenResult: boolean;
  shortcuts: boolean;
}

export const DEFAULT_PREFS: Prefs = { sound: true, spokenResult: true, shortcuts: true };
const KEY = "molbhav:prefs";
const listeners = new Set<() => void>();
let cache: Prefs | null = null;

function read(): Prefs {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = { ...DEFAULT_PREFS, ...(raw ? (JSON.parse(raw) as Partial<Prefs>) : {}) };
  } catch {
    cache = DEFAULT_PREFS; // private mode or blocked storage: defaults, never a crash
  }
  return cache;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  cache = { ...read(), [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // keep the in-memory value for this visit
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULT_PREFS,
  );
}
