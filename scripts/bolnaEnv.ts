// Shared by the bolna:* scripts: where secrets and settings come from, without ever printing a value.
// A secret is read from the process env (`.env.local` is loaded by `tsx --env-file-if-exists`), or, with
// --from-convex, from the Convex deployment's env through `npx convex env get` (dev; --prod for production).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface Args {
  flags: Set<string>;
  values: Map<string, string>;
}

/** `--name value` and bare `--flag` arguments. */
export function parseArgs(argv: readonly string[], valued: readonly string[]): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument "${a}"`);
    const [name, inline] = a.slice(2).split("=", 2);
    if (valued.includes(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
      values.set(name, value);
    } else {
      if (inline !== undefined) throw new Error(`--${name} takes no value`);
      flags.add(name);
    }
  }
  return { flags, values };
}

/** A setting from the process env, else (with fromConvex) from the Convex deployment. Never logged. */
export function readSetting(name: string, opts: { fromConvex: boolean; prod: boolean }): string | undefined {
  const local = process.env[name]?.trim();
  if (local) return local;
  if (!opts.fromConvex) return undefined;
  try {
    const out = execFileSync("npx", ["convex", "env", "get", ...(opts.prod ? ["--prod"] : []), name], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out === "" ? undefined : out;
  } catch {
    return undefined;
  }
}

/** https://<deployment>.convex.site: --site-url, CONVEX_SITE_URL, else derived from NEXT_PUBLIC_CONVEX_URL (.convex.cloud). */
export function siteUrl(explicit: string | undefined): string | undefined {
  const raw = explicit ?? process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.convex\.cloud\/?$/, ".convex.site");
  return raw?.trim().replace(/\/+$/, "");
}

export function readCallScript(): string {
  return readFileSync(path.join(ROOT, "docs/CALL_SCRIPT.md"), "utf8");
}
