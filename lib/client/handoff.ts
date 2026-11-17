// Small notes one screen leaves for the next in this tab (sessionStorage), read once:
// - the read-back plays by itself once on Confirm after a VOICE order (V3, PROGRESS §4b);
// - a corrected order replaces the draft it fixes: the new Confirm cancels the old draft once it has
//   mounted (cancelling earlier would make the old Confirm screen redirect mid-navigation).
// Storage can be blocked (private mode): then nothing auto-plays and the old draft simply stays a draft.

const AUTO = "molbhav:autoReadBack";
const REPLACES = "molbhav:replaces";
const PENDING = "molbhav:pendingReplace";
/** "फिर से बोलिए" from Confirm: the next voice order within this long replaces that draft. */
export const PENDING_REPLACE_MS = 10 * 60_000;

function get(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // blocked storage: the note is lost, never a crash
  }
}

export function markAutoReadBack(orderId: string) {
  set(AUTO, orderId);
}

/** True once, on the Confirm of the order that was just spoken. */
export function takeAutoReadBack(orderId: string): boolean {
  if (get(AUTO) !== orderId) return false;
  set(AUTO, null);
  return true;
}

export function markReplaces(newId: string, oldId: string) {
  if (newId !== oldId) set(REPLACES, JSON.stringify({ newId, oldId }));
}

/** The draft the order `newId` replaces, once. */
export function takeReplaced(newId: string): string | null {
  const raw = get(REPLACES);
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as { newId?: unknown; oldId?: unknown };
    if (v.newId !== newId || typeof v.oldId !== "string") return null;
    set(REPLACES, null);
    return v.oldId;
  } catch {
    set(REPLACES, null);
    return null;
  }
}

/** Confirm's "फिर से बोलिए": the next spoken order replaces this draft. */
export function markPendingReplace(oldId: string, now: number = Date.now()) {
  set(PENDING, JSON.stringify({ oldId, at: now }));
}

export function takePendingReplace(now: number = Date.now()): string | null {
  const raw = get(PENDING);
  if (raw === null) return null;
  set(PENDING, null);
  try {
    const v = JSON.parse(raw) as { oldId?: unknown; at?: unknown };
    return typeof v.oldId === "string" && typeof v.at === "number" && now - v.at >= 0 && now - v.at <= PENDING_REPLACE_MS ? v.oldId : null;
  } catch {
    return null;
  }
}
