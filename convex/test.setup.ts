// Function modules for convex-test (every .ts/.js under convex/ except tests).
// Vite rewrites import.meta.glob at test time; convex/importMeta.d.ts types it.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.test.*s"]);
