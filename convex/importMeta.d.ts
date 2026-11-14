// Types for Vite's import.meta.glob, used only by Vitest test files under convex/.
interface ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
  glob<T = Record<string, unknown>>(pattern: string | string[], options: { eager: true }): Record<string, T>;
}
