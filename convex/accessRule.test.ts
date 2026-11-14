// The access rule (Phase 1A item 4): every exported public query, mutation or action in convex/
// must call an access helper, so no public function forgets auth or ownership. Internal functions
// (internalQuery/internalMutation/internalAction) and httpAction are not public API and are skipped
// (HTTP routes check their own secrets). Files listed in EXEMPT are library-generated.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const CONVEX_DIR = path.resolve(__dirname);
const EXEMPT = new Set(["auth.ts", "auth.config.ts", "http.ts", "schema.ts", "convex.config.ts", "test.setup.ts"]);
const GUARDS = /\b(requireUser|requireContractor|requireOwner|requireOwnedOrder|requireAdmin|optionalUser|requireServerSecret)\s*\(/;
const PUBLIC_EXPORT = /export\s+const\s+(\w+)\s*=\s*(query|mutation|action)\s*\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const rel = path.relative(CONVEX_DIR, full);
    if (statSync(full).isDirectory()) {
      return name === "_generated" || name === "lib" ? [] : sourceFiles(full);
    }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name) || EXEMPT.has(rel)) return [];
    return [full];
  });
}

/** Public functions whose body doesn't call an access helper, as "file:name". */
function unguardedPublicFunctions(files: string[]): string[] {
  const missing: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const exports = [...src.matchAll(PUBLIC_EXPORT)];
    exports.forEach((m, i) => {
      const start = m.index ?? 0;
      const end = i + 1 < exports.length ? (exports[i + 1].index ?? src.length) : src.length;
      const body = src.slice(start, end);
      if (!GUARDS.test(body)) missing.push(`${path.relative(CONVEX_DIR, file)}:${m[1]}`);
    });
  }
  return missing;
}

describe("access rule", () => {
  test("every public Convex function calls an access helper", () => {
    const files = sourceFiles(CONVEX_DIR);
    expect(files.length).toBeGreaterThan(0);
    expect(unguardedPublicFunctions(files)).toEqual([]);
  });

  test("the checker would catch an unguarded function", () => {
    const leak = 'export const leak = query({ args: {}, handler: async (ctx) => ctx.db.query("dealers").collect() });';
    expect([...leak.matchAll(PUBLIC_EXPORT)]).toHaveLength(1);
    expect(GUARDS.test(leak)).toBe(false);
    const guarded = "export const ok = query({ args: {}, handler: async (ctx) => { await requireAdmin(ctx); } });";
    expect(GUARDS.test(guarded)).toBe(true);
  });
});
