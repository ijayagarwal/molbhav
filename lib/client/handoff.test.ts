import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { markAutoReadBack, markPendingReplace, markReplaces, PENDING_REPLACE_MS, takeAutoReadBack, takePendingReplace, takeReplaced } from "./handoff";

// sessionStorage for the node test environment.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("notes between screens", () => {
  test("the read-back plays by itself once, and only for the order just spoken", () => {
    markAutoReadBack("a");
    expect(takeAutoReadBack("b")).toBe(false);
    expect(takeAutoReadBack("a")).toBe(true);
    expect(takeAutoReadBack("a")).toBe(false);
  });

  test("a fixed order names the draft it replaces, once", () => {
    markReplaces("new", "old");
    expect(takeReplaced("other")).toBeNull();
    expect(takeReplaced("new")).toBe("old");
    expect(takeReplaced("new")).toBeNull();
    markReplaces("same", "same");
    expect(takeReplaced("same")).toBeNull();
  });

  test("'say it again' replaces the draft only within ten minutes", () => {
    markPendingReplace("old", 0);
    expect(takePendingReplace(PENDING_REPLACE_MS)).toBe("old");
    expect(takePendingReplace(PENDING_REPLACE_MS)).toBeNull();
    markPendingReplace("old", 0);
    expect(takePendingReplace(PENDING_REPLACE_MS + 1)).toBeNull();
  });

  test("blocked storage never throws", () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(() => markAutoReadBack("a")).not.toThrow();
    expect(takeAutoReadBack("a")).toBe(false);
    expect(takeReplaced("a")).toBeNull();
    expect(takePendingReplace()).toBeNull();
  });
});
