import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

const alias = {
  "@": root,
  // `server-only` throws outside a React Server Components build; tests import server modules directly.
  "server-only": path.resolve(root, "test/server-only-stub.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          exclude: ["convex/_generated/**"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
