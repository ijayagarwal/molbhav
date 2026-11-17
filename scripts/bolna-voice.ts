// Switches which voice the phone agents use, by pointing the deployment at one of the agent sets in
// bolna/voice-sets.json (R20). Only the four BOLNA_*_AGENT_ID env vars change: nothing is sent to Bolna, so the
// dashboard-only webhook header on each agent is never lost, and switching back is instant.
//   pnpm bolna:voice                  shows the active set
//   pnpm bolna:voice elevenlabs       uses the ElevenLabs set (dev)
//   pnpm bolna:voice sarvam           uses the Sarvam set (dev)
//   pnpm bolna:voice <set> --prod     the same on production (only once production sets exist)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type AgentSet = { target: string; voice: string; quote: string; haggle: string; match: string; confirm: string };
const ROUNDS = ["quote", "haggle", "match", "confirm"] as const;

function convex(args: string[]): string {
  return execFileSync("npx", ["convex", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function main(argv: string[]): number {
  const prod = argv.includes("--prod");
  const deployment = prod ? "prod" : "dev";
  const wanted = argv.find((a) => !a.startsWith("--"));
  const sets = (JSON.parse(readFileSync("bolna/voice-sets.json", "utf8")) as Record<string, Record<string, AgentSet> | string>)[deployment];
  if (sets === undefined || typeof sets === "string") {
    console.log(`No agent sets for ${deployment} in bolna/voice-sets.json.`);
    return 1;
  }
  const flag = prod ? ["--prod"] : [];
  const current = Object.fromEntries(ROUNDS.map((r) => [r, convex(["env", "get", `BOLNA_${r.toUpperCase()}_AGENT_ID`, ...flag])]));
  const active = Object.entries(sets).find(([, s]) => ROUNDS.every((r) => s[r] === current[r]))?.[0] ?? "(none of the sets: custom ids)";
  if (wanted === undefined) {
    console.log(`${deployment}: active voice set = ${active}`);
    for (const [name, s] of Object.entries(sets)) console.log(`  ${name}: ${s.voice} (agents "[${s.target}]")`);
    return 0;
  }
  const set = sets[wanted];
  if (set === undefined) {
    console.log(`Unknown set "${wanted}". Choose one of: ${Object.keys(sets).join(", ")}`);
    return 1;
  }
  for (const r of ROUNDS) convex(["env", "set", `BOLNA_${r.toUpperCase()}_AGENT_ID`, set[r], ...flag]);
  console.log(`${deployment}: now using "${wanted}" · ${set.voice} (agents "[${set.target}]"). Was: ${active}.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
