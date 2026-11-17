import { describe, expect, test } from "vitest";
import { createLazyRecorder } from "./lazyRecorder";
import { createFakeRecorder, type Recorder } from "./recorder";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("the lazy recorder (first-use loading, DESIGN §20)", () => {
  test("loads the real recorder once, on the first start", async () => {
    let loads = 0;
    let now = 0;
    const lazy = createLazyRecorder(async () => {
      loads++;
      return createFakeRecorder({ script: [[0, 1000]], clock: () => now });
    });
    expect(lazy.getLevel()).toBe(0);
    await lazy.start();
    now = 1000;
    expect(lazy.getSpeechMs()).toBe(1000);
    expect(await lazy.stop()).not.toBeNull();
    await lazy.start();
    expect(loads).toBe(1);
  });

  test("a cancel while the chunk loads makes start reject with 'cancelled' (no take starts)", async () => {
    const d = deferred<Recorder>();
    let started = 0;
    const inner = createFakeRecorder();
    const lazy = createLazyRecorder(() => d.promise);
    const p = lazy.start();
    lazy.cancel();
    d.resolve({ ...inner, start: async () => void started++ });
    await expect(p).rejects.toThrow("cancelled");
    expect(started).toBe(0);
  });

  test("a stop while the chunk loads is an empty take", async () => {
    const d = deferred<Recorder>();
    const lazy = createLazyRecorder(() => d.promise);
    const p = lazy.start();
    expect(await lazy.stop()).toBeNull();
    d.resolve(createFakeRecorder());
    await expect(p).rejects.toThrow("cancelled");
  });

  test("a failed load reads as no_input and is tried again on the next press", async () => {
    let attempt = 0;
    const lazy = createLazyRecorder(async () => {
      attempt++;
      if (attempt === 1) throw new Error("chunk failed");
      return createFakeRecorder();
    });
    await expect(lazy.start()).rejects.toThrow("no_input");
    await expect(lazy.start()).resolves.toBeUndefined();
    expect(attempt).toBe(2);
  });
});
