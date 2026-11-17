// pnpm bolna:build  writes bolna/agents/{quote,haggle,match,confirm}.json from docs/CALL_SCRIPT.md (offline).
// pnpm bolna:sync   builds them, then creates or updates the four agents through Bolna's agent API
//                   (POST /v2/agent, PUT /v2/agent/{id}) and prints their ids. It NEVER dials: its client
//                   can't reach /call or /batches (lib/bolna/api.ts SCRIPT_ENDPOINTS). DECISIONS R12.
//
// Options:
//   --target dev|demo|prod     which deployment the agents serve (their names end in [target]); default dev
//   --site-url https://….convex.site   the deployment's site; default from CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_URL
//   --voice sarvam|elevenlabs  R20: Sarvam ashutosh (default) or the ElevenLabs comparison voice; or BOLNA_VOICE
//   --telephony plivo|exotel|vobiz|twilio   the agents' telephony provider; default plivo, or BOLNA_TELEPHONY
//   --from-convex              read BOLNA_API_KEY and BOLNA_WEBHOOK_SECRET from the Convex env (npx convex env get)
//   --dry-run                  build and check everything, send nothing
//   --copy-webhook-secret      put BOLNA_WEBHOOK_SECRET on the macOS clipboard (for the dashboard's webhook header)
// Secrets are never printed: only names, ids and URLs.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBolnaClient, SCRIPT_ENDPOINTS, type BolnaClient } from "../lib/bolna/api";
import {
  agentProblems,
  buildAgentConfigs,
  ELEVENLABS_VOICE,
  fillPlaceholders,
  ROUNDS,
  SARVAM_VOICE,
  withVoice,
  type AgentConfig,
  type BuildOptions,
  type VoiceSpec,
} from "../lib/bolna/agents";
import type { Round } from "../lib/domain";
import { parseArgs, readCallScript, readSetting, ROOT, siteUrl } from "./bolnaEnv";

export const AGENTS_DIR = path.join(ROOT, "bolna/agents");
export const AGENT_ENV: Record<Round, string> = {
  quote: "BOLNA_QUOTE_AGENT_ID",
  haggle: "BOLNA_HAGGLE_AGENT_ID",
  match: "BOLNA_MATCH_AGENT_ID",
  confirm: "BOLNA_CONFIRM_AGENT_ID",
};

const stable = (x: unknown) => `${JSON.stringify(x, null, 2)}\n`;

/** Writes bolna/agents/*.json (templates with placeholders, the default voice). Returns the files that changed. */
export function writeAgentFiles(md: string, dir = AGENTS_DIR): string[] {
  const configs = buildAgentConfigs(md);
  mkdirSync(dir, { recursive: true });
  const changed: string[] = [];
  for (const r of ROUNDS) {
    const file = path.join(dir, `${r}.json`);
    let before = "";
    try {
      before = readFileSync(file, "utf8");
    } catch {
      // new file
    }
    const after = stable(configs[r]);
    if (before !== after) {
      writeFileSync(file, after);
      changed.push(path.relative(ROOT, file));
    }
  }
  return changed;
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/**
 * Checks the voice against Bolna's catalogue (GET /api/v1/voice-config/tts…) and takes its exact display
 * name. A Sarvam voice that isn't offered falls back to the closest male conversational voice of the same
 * language, said out loud; an ElevenLabs voice that isn't offered stops the sync.
 */
export async function resolveVoice(client: BolnaClient, spec: VoiceSpec, log: (s: string) => void): Promise<VoiceSpec> {
  const out: VoiceSpec = JSON.parse(JSON.stringify(spec));
  for (const lang of ["hi", "en"] as const) {
    const catalogue = await client.ttsProviders(lang);
    const provider = arr(isObj(catalogue) ? catalogue.providers : undefined).find((p) => isObj(p) && p.slug === spec.provider);
    const model = isObj(provider) ? arr(provider.models).find((m) => isObj(m) && m.model_id === spec.model) : undefined;
    if (!isObj(provider) || !isObj(model)) throw new Error(`Bolna doesn't offer ${spec.provider} ${spec.model} for "${lang}"`);
    const voices: Obj[] = [];
    for (let page = 1; page <= 5; page++) {
      const res = await client.ttsVoices({ providerId: String(provider.id), modelId: String(model.id), language: lang, page });
      const items = arr(isObj(res) ? res.items : undefined).filter(isObj);
      voices.push(...items);
      if (items.length < 100) break;
    }
    const wanted = voices.find((v) => v.voice_id === spec[lang].voiceId);
    if (wanted !== undefined) {
      out[lang] = { voice: String(wanted.name), voiceId: spec[lang].voiceId };
      continue;
    }
    if (spec.provider !== "sarvam") throw new Error(`voice ${spec[lang].voiceId} isn't in Bolna's ${spec.provider} catalogue (connect your own key, or set BOLNA_ELEVENLABS_VOICE_ID)`);
    const male = voices.filter((v) => v.gender === "male");
    const fallback = male.find((v) => String(v.voice_id).includes("conversational")) ?? male[0];
    if (fallback === undefined) throw new Error(`no male Sarvam ${spec.model} voice for "${lang}" in Bolna's catalogue`);
    log(`  voice ${spec[lang].voiceId} isn't offered for "${lang}"; using the closest male voice: ${String(fallback.voice_id)} (${String(fallback.name)})`);
    out[lang] = { voice: String(fallback.name), voiceId: String(fallback.voice_id) };
  }
  return out;
}

export interface SyncResult {
  round: Round;
  id: string;
  action: "created" | "updated";
  warnings: string[];
}

/** Creates or updates the four agents by name, then reads each back to check it. Never dials. */
export async function syncAgents(client: BolnaClient, configs: Record<Round, AgentConfig>, site: string): Promise<SyncResult[]> {
  const listed = arr(await client.listAgents()).filter(isObj);
  const results: SyncResult[] = [];
  for (const round of ROUNDS) {
    const body = configs[round];
    const name = body.agent_config.agent_name;
    const same = listed.filter((a) => a.agent_name === name);
    if (same.length > 1) throw new Error(`${same.length} agents are named "${name}" in Bolna; delete the extra ones in the dashboard first`);
    let id: string;
    let action: SyncResult["action"];
    if (same.length === 1) {
      id = String(same[0].id);
      await client.updateAgent(id, body);
      action = "updated";
    } else {
      const res = await client.createAgent(body);
      const created = isObj(res) ? res.agent_id : undefined;
      if (typeof created !== "string") throw new Error(`Bolna didn't return an agent_id for ${name}`);
      id = created;
      action = "created";
    }
    const got = JSON.stringify(await client.getAgent(id));
    const warnings: string[] = [];
    if (!got.includes(`${site}/bolna/report-quote`)) warnings.push("report_quote isn't visible on the saved agent: add it by hand (docs/BOLNA_SETUP.md, manual fallback)");
    if (!got.includes(`${site}/bolna/webhook`)) warnings.push("the webhook URL isn't visible through the API: check it in the dashboard (Extractions tab)");
    if (/transfer_call/i.test(got)) warnings.push("the saved agent has a transfer_call tool: remove it now");
    if (/"auto_reschedule":\s*true/.test(got)) warnings.push("auto_reschedule is on: turn it off");
    results.push({ round, id, action, warnings });
  }
  return results;
}

export async function main(argv: readonly string[], log: (s: string) => void = console.log, client?: BolnaClient): Promise<number> {
  const args = parseArgs(argv, ["target", "site-url", "voice", "telephony"]);
  const md = readCallScript();
  const changed = writeAgentFiles(md);
  log(changed.length === 0 ? "bolna/agents/*.json are up to date with docs/CALL_SCRIPT.md" : `wrote ${changed.join(", ")}`);
  if (args.flags.has("build-only")) return 0;

  const target = args.values.get("target") ?? "dev";
  const prod = target === "prod";
  const fromConvex = args.flags.has("from-convex");
  const apiKey = readSetting("BOLNA_API_KEY", { fromConvex, prod });
  if (apiKey === undefined) {
    log("BOLNA_API_KEY is not set: put it in .env.local, or pass --from-convex to read it from the Convex env. Nothing was sent.");
    return 1;
  }
  const secret = readSetting("BOLNA_WEBHOOK_SECRET", { fromConvex, prod });
  if (secret === undefined) {
    log("BOLNA_WEBHOOK_SECRET is not set (same places as BOLNA_API_KEY). Nothing was sent.");
    return 1;
  }
  const site = siteUrl(args.values.get("site-url"));
  if (site === undefined) {
    log("No Convex site URL: pass --site-url https://<deployment>.convex.site (or set CONVEX_SITE_URL). Nothing was sent.");
    return 1;
  }
  const voiceName = args.values.get("voice") ?? process.env.BOLNA_VOICE ?? "sarvam";
  if (voiceName !== "sarvam" && voiceName !== "elevenlabs") {
    log(`--voice must be sarvam or elevenlabs, not "${voiceName}"`);
    return 1;
  }
  const telephony = (args.values.get("telephony") ?? process.env.BOLNA_TELEPHONY ?? "plivo") as NonNullable<BuildOptions["telephony"]>;
  if (!["plivo", "exotel", "vobiz", "twilio"].includes(telephony)) {
    log(`--telephony must be plivo, exotel, vobiz or twilio, not "${telephony}"`);
    return 1;
  }
  let voice: VoiceSpec =
    voiceName === "sarvam"
      ? SARVAM_VOICE
      : {
          ...ELEVENLABS_VOICE,
          model: process.env.BOLNA_ELEVENLABS_MODEL?.trim() || ELEVENLABS_VOICE.model,
          hi: { ...ELEVENLABS_VOICE.hi, voiceId: process.env.BOLNA_ELEVENLABS_VOICE_ID?.trim() || ELEVENLABS_VOICE.hi.voiceId },
          en: { ...ELEVENLABS_VOICE.en, voiceId: process.env.BOLNA_ELEVENLABS_VOICE_ID?.trim() || ELEVENLABS_VOICE.en.voiceId },
        };

  const bolna = client ?? createBolnaClient({ apiKey, allow: SCRIPT_ENDPOINTS });
  const dryRun = args.flags.has("dry-run");
  if (!dryRun) voice = await resolveVoice(bolna, voice, log);
  const templates = buildAgentConfigs(md, { telephony });
  const configs = Object.fromEntries(
    ROUNDS.map((r) => [r, fillPlaceholders(withVoice(templates[r], voice), { siteUrl: site, secret, target })]),
  ) as Record<Round, AgentConfig>;
  for (const r of ROUNDS) {
    const problems = agentProblems(configs[r]);
    if (problems.length > 0) {
      log(`${r}: refusing to sync: ${problems.join("; ")}`);
      return 1;
    }
  }
  log(`target ${target} · site ${site} · voice ${voice.provider} ${voice.hi.voiceId} / ${voice.en.voiceId} (${voice.model}) · telephony ${telephony}`);
  if (dryRun) {
    for (const r of ROUNDS) log(`  ${configs[r].agent_config.agent_name}: ${JSON.stringify(configs[r]).length} bytes, ready (dry run: nothing sent)`);
    return 0;
  }

  const results = await syncAgents(bolna, configs, site);
  for (const r of results) {
    log(`${r.action} ${configs[r.round].agent_config.agent_name}: ${r.id}`);
    for (const w of r.warnings) log(`  ! ${w}`);
  }
  log("\nSet the agent ids on the Convex deployment (ids are not secrets):");
  for (const r of results) log(`  npx convex env set ${prod ? "--prod " : ""}${AGENT_ENV[r.round]} ${r.id}`);
  log(
    "\nOne manual step per agent (Bolna's API has no field for it): in the Bolna dashboard open the agent → Extractions tab → " +
      `Webhook Configuration → Add headers → name x-molbhav-secret, value BOLNA_WEBHOOK_SECRET → Save agent. Check the URL there is ${site}/bolna/webhook.`,
  );
  if (args.flags.has("copy-webhook-secret")) {
    execFileSync("pbcopy", [], { input: secret });
    log("BOLNA_WEBHOOK_SECRET is on the clipboard for that field (not printed).");
  }
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : "bolna:sync failed");
      process.exitCode = 1;
    },
  );
}
