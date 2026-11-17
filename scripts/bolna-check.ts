// pnpm bolna:check: read-only look at the Bolna account (DECISIONS R12; PROMPTS 8B item 4).
//   - verifies the key and prints the wallet and concurrency (GET /user/me);
//   - lists the four Molbhav agents (by BOLNA_*_AGENT_ID, else by name for --target) with their webhook URL,
//     header NAMES, tools, voice, transcriber and the settings that must stay off.
// GETs only: its client can't create, change or dial anything. Secrets and header values are never printed.
// Options: --target dev|demo|prod (default dev), --from-convex (read the key and agent ids from the Convex env).
import { pathToFileURL } from "node:url";
import { createBolnaClient, SCRIPT_ENDPOINTS, type BolnaClient } from "../lib/bolna/api";
import { agentName, ROUNDS } from "../lib/bolna/agents";
import { parseArgs, readSetting } from "./bolnaEnv";
import { AGENT_ENV } from "./bolna-sync";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);

/** Every value under a key named `key`, anywhere in the object. */
function findAll(x: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(x)) x.forEach((v) => findAll(v, key, out));
  else if (isObj(x)) {
    for (const [k, v] of Object.entries(x)) {
      if (k === key) out.push(v);
      else findAll(v, key, out);
    }
  }
  return out;
}

/** Header NAMES found under any `*headers*` key (values never printed). */
function headerNames(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((v) => headerNames(v, out));
  else if (isObj(x)) {
    for (const [k, v] of Object.entries(x)) {
      if (/headers?$/i.test(k) && isObj(v)) Object.keys(v).forEach((h) => out.add(h));
      else headerNames(v, out);
    }
  }
  return out;
}

/** One agent, summarised without secrets. */
export function describeAgent(agent: unknown): string[] {
  if (!isObj(agent)) return ["  (Bolna returned nothing usable)"];
  const lines: string[] = [];
  const task = findAll(agent, "tools_config")[0];
  const tc = isObj(task) ? task : {};
  const synth = isObj(tc.synthesizer) ? tc.synthesizer : {};
  const pc = isObj(synth.provider_config) ? synth.provider_config : {};
  const tr = isObj(tc.transcriber) ? tc.transcriber : {};
  const tools = findAll(agent, "tools").flatMap((t) => (Array.isArray(t) ? t : [])).filter(isObj);
  const webhook = findAll(agent, "webhook_url").find((v) => typeof v === "string");
  lines.push(`  status: ${String(agent.agent_status ?? "?")} · updated ${String(agent.updated_at ?? "?")}`);
  lines.push(`  webhook: ${typeof webhook === "string" ? webhook : "(not returned by the API: check the dashboard's Extractions tab)"}`);
  lines.push(`  header names: ${[...headerNames(agent)].sort().join(", ") || "(none visible; the webhook header is set in the dashboard)"}`);
  lines.push(`  tools: ${tools.map((t) => `${String(t.name)} (${String(t.key)})`).join(", ") || "(none)"}`);
  for (const url of findAll(agent, "url").filter((u): u is string => typeof u === "string")) lines.push(`  tool url: ${url}`);
  lines.push(`  voice: ${String(synth.provider ?? "?")} ${String(pc.voice_id ?? "?")} ${String(pc.model ?? "")}`.trimEnd());
  lines.push(`  transcriber: ${String(tr.provider ?? "?")} ${String(tr.model ?? "")} ${String(tr.language ?? "")}`.trimEnd());
  const terminate = findAll(agent, "call_terminate")[0];
  if (terminate !== undefined) lines.push(`  call_terminate: ${String(terminate)} s`);
  const problems: string[] = [];
  if (/transfer_call/i.test(JSON.stringify(agent))) problems.push("has transfer_call");
  if (findAll(agent, "auto_reschedule").some((v) => v === true)) problems.push("auto_reschedule is on");
  if (findAll(agent, "calling_guardrails").some((v) => isObj(v) && Object.keys(v).length > 0)) problems.push("calling_guardrails set (Bolna would reschedule)");
  if (tools.some((t) => t.name !== "report_quote")) problems.push("a tool other than report_quote");
  lines.push(problems.length === 0 ? "  checks: ok" : `  PROBLEMS: ${problems.join("; ")}`);
  return lines;
}

export async function check(client: BolnaClient, ids: Partial<Record<(typeof ROUNDS)[number], string>>, target: string, log: (s: string) => void): Promise<number> {
  const me = await client.userMe();
  const wallet = isObj(me) ? me.wallet : undefined;
  const conc = isObj(me) && isObj(me.concurrency) ? me.concurrency : {};
  log(`key ok · wallet ${typeof wallet === "number" ? wallet : "?"} · concurrency ${String(conc.current ?? "?")}/${String(conc.max ?? "?")} (the trial allows 2)`);
  let listed: Obj[] | null = null;
  let problems = 0;
  for (const round of ROUNDS) {
    let id = ids[round];
    const name = agentName(round, target);
    if (id === undefined) {
      if (listed === null) {
        const all = await client.listAgents();
        listed = (Array.isArray(all) ? all : []).filter(isObj);
      }
      const found = listed.find((a) => a.agent_name === name);
      id = found === undefined ? undefined : String(found.id);
    }
    if (id === undefined) {
      log(`${name}: not found (run pnpm bolna:sync, then set ${AGENT_ENV[round]})`);
      problems++;
      continue;
    }
    log(`${name}: ${id}${ids[round] === undefined ? ` (found by name; ${AGENT_ENV[round]} is not set here)` : ""}`);
    const lines = describeAgent(await client.getAgent(id));
    if (lines.some((l) => l.includes("PROBLEMS"))) problems++;
    lines.forEach((l) => log(l));
  }
  return problems === 0 ? 0 : 1;
}

export async function main(argv: readonly string[], log: (s: string) => void = console.log, client?: BolnaClient): Promise<number> {
  const args = parseArgs(argv, ["target"]);
  const target = args.values.get("target") ?? "dev";
  const opts = { fromConvex: args.flags.has("from-convex"), prod: target === "prod" };
  const apiKey = readSetting("BOLNA_API_KEY", opts);
  if (apiKey === undefined) {
    log("BOLNA_API_KEY is not set: put it in .env.local, or pass --from-convex. Nothing was requested.");
    return 1;
  }
  const ids: Partial<Record<(typeof ROUNDS)[number], string>> = {};
  for (const r of ROUNDS) {
    const id = readSetting(AGENT_ENV[r], opts);
    if (id !== undefined) ids[r] = id;
  }
  return await check(client ?? createBolnaClient({ apiKey, allow: SCRIPT_ENDPOINTS }), ids, target, log);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : "bolna:check failed");
      process.exitCode = 1;
    },
  );
}
