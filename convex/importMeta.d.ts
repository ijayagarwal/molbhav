// Types for Vite's import.meta.glob, used only by convex/test.setup.ts under Vitest.
interface ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}
