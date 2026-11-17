// bolna:sync and bolna:check against a fake Bolna: they create or update agents and read, never dial, and
// never print a secret. fetch is injected; nothing leaves the test.
import { afterEach, describe, expect, test, vi } from "vitest";
import { createBolnaClient, SCRIPT_ENDPOINTS } from "../lib/bolna/api";
import { buildAgentConfigs, fillPlaceholders, ROUNDS, SARVAM_VOICE } from "../lib/bolna/agents";
import type { Round } from "../lib/domain";
import { main as checkMain, describeAgent } from "./bolna-check";
import { readCallScript } from "./bolnaEnv";
import { main as syncMain, resolveVoice, syncAgents } from "./bolna-sync";

const KEY = "bn-script-test-key";
const SECRET = "webhook-secret-for-tests-0123456789";
const SITE = "https://happy-otter-123.convex.site";
const SARVAM = { id: "9e675bdf-00e5-5bd5-b858-f1b088a48dbd", model: "5d82c5f4-458f-5ff6-ae2b-a5e692b77a2c" };

type Req = { method: string; path: string; body?: unknown };

function fakeBolna(opts: { existing?: { id: string; agent_name: string }[]; voices?: Record<string, { voice_id: string; name: string; gender: string }[]> } = {}) {
  const requests: Req[] = [];
  const agents = new Map<string, unknown>();
  let n = 0;
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    requests.push({ method, path: url.pathname + url.search, body });
    if (url.pathname === "/user/me") return Response.json({ id: "u", name: "Team", email: "team@example.com", wallet: 4.2, concurrency: { max: 2, current: 0 } });
    if (url.pathname === "/v2/agent/all") return Response.json(opts.existing ?? []);
    if (method === "POST" && url.pathname === "/v2/agent") {
      const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(++n).padStart(12, "0")}`;
      agents.set(id, body);
      return Response.json({ agent_id: id, state: "created" }, { status: 201 });
    }
    const one = /^\/v2\/agent\/([^/]+)$/.exec(url.pathname);
    if (one && method === "PUT") {
      agents.set(one[1], body);
      return Response.json({ agent_id: one[1], status: "updated" });
    }
    if (one && method === "GET") {
      const a = agents.get(one[1]) as { agent_config: Record<string, unknown>; agent_prompts: unknown } | undefined;
      return a === undefined ? new Response("{}", { status: 404 }) : Response.json({ id: one[1], agent_status: "processed", ...a.agent_config, agent_prompts: a.agent_prompts });
    }
    if (url.pathname === "/api/v1/voice-config/tts") {
      return Response.json({ providers: [{ id: SARVAM.id, slug: "sarvam", models: [{ id: SARVAM.model, model_id: "bulbul:v4-flash" }] }] });
    }
    if (url.pathname === "/api/v1/voice-config/tts/voices") {
      const lang = url.searchParams.get("language") ?? "hi";
      const voices = opts.voices?.[lang] ?? [
        { voice_id: "ashutosh_hi_conversational", name: "Ashutosh (Conversational)", gender: "male" },
        { voice_id: "dev_en_conversational", name: "Dev (Conversational)", gender: "male" },
      ];
      return Response.json({ items: voices });
    }
    throw new Error(`unexpected ${method} ${url.pathname}`);
  });
  return { requests, agents, client: createBolnaClient({ apiKey: KEY, allow: SCRIPT_ENDPOINTS, fetchImpl }), fetchImpl };
}

afterEach(() => vi.unstubAllEnvs());

const configsFor = (target: string) => {
  const t = buildAgentConfigs(readCallScript());
  return Object.fromEntries(ROUNDS.map((r) => [r, fillPlaceholders(t[r], { siteUrl: SITE, secret: SECRET, target })])) as Record<Round, ReturnType<typeof fillPlaceholders>>;
};

describe("bolna:sync", () => {
  test("refuses to run without BOLNA_API_KEY, and sends nothing", async () => {
    vi.stubEnv("BOLNA_API_KEY", "");
    const fake = fakeBolna();
    const out: string[] = [];
    expect(await syncMain([], (s) => out.push(s), fake.client)).toBe(1);
    expect(out.join("\n")).toMatch(/BOLNA_API_KEY is not set/);
    expect(fake.fetchImpl).not.toHaveBeenCalled();
  });

  test("creates the missing agents, updates the existing one by name, reads each back, and never dials", async () => {
    const fake = fakeBolna({ existing: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", agent_name: "Molbhav Quote [dev]" }] });
    const results = await syncAgents(fake.client, configsFor("dev"), SITE);
    expect(results.map((r) => [r.round, r.action])).toEqual([
      ["quote", "updated"],
      ["haggle", "created"],
      ["match", "created"],
      ["confirm", "created"],
    ]);
    expect(results.every((r) => r.warnings.length === 0)).toBe(true);
    const writes = fake.requests.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`);
    expect(writes).toEqual(["PUT /v2/agent/bbbbbbbb-bbbb-4bbb-8bbb-000000000001", "POST /v2/agent", "POST /v2/agent", "POST /v2/agent"]);
    expect(fake.requests.some((r) => r.path.startsWith("/call") || r.path.startsWith("/batches"))).toBe(false);
  });

  test("two agents with the same name stop the sync", async () => {
    const dup = { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", agent_name: "Molbhav Quote [dev]" };
    const fake = fakeBolna({ existing: [dup, { ...dup, id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002" }] });
    await expect(syncAgents(fake.client, configsFor("dev"), SITE)).rejects.toThrow(/2 agents are named/);
  });

  test("a full run prints ids and the env commands, never the secret or the key", async () => {
    vi.stubEnv("BOLNA_API_KEY", KEY);
    vi.stubEnv("BOLNA_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("CONVEX_SITE_URL", SITE);
    const fake = fakeBolna();
    const out: string[] = [];
    expect(await syncMain(["--target", "dev"], (s) => out.push(s), fake.client)).toBe(0);
    const text = out.join("\n");
    expect(text).toMatch(/npx convex env set BOLNA_QUOTE_AGENT_ID aaaaaaaa-/);
    expect(text).toMatch(/x-molbhav-secret/);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(KEY);
    // What Bolna received carries the real site and secret (the secret only in the report_quote header).
    const sent = JSON.stringify([...fake.agents.values()]);
    expect(sent).toContain(`${SITE}/bolna/webhook`);
    expect(sent).not.toContain("@@");
  });

  test("--dry-run sends nothing", async () => {
    vi.stubEnv("BOLNA_API_KEY", KEY);
    vi.stubEnv("BOLNA_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("CONVEX_SITE_URL", SITE);
    const fake = fakeBolna();
    expect(await syncMain(["--dry-run", "--voice", "elevenlabs"], () => {}, fake.client)).toBe(0);
    expect(fake.fetchImpl).not.toHaveBeenCalled();
  });

  test("the voice is checked against Bolna's catalogue; a missing Sarvam voice falls back to the closest male one", async () => {
    const fake = fakeBolna({
      voices: {
        hi: [
          { voice_id: "aparna_hi_customer", name: "Aparna (Customer)", gender: "female" },
          { voice_id: "rohan_hi_conversational", name: "Rohan (Conversational)", gender: "male" },
        ],
        en: [{ voice_id: "dev_en_conversational", name: "Dev (Conversational)", gender: "male" }],
      },
    });
    const logs: string[] = [];
    const v = await resolveVoice(fake.client, SARVAM_VOICE, (s) => logs.push(s));
    expect(v.hi).toEqual({ voice: "Rohan (Conversational)", voiceId: "rohan_hi_conversational" });
    expect(v.en).toEqual({ voice: "Dev (Conversational)", voiceId: "dev_en_conversational" });
    expect(logs.join()).toMatch(/closest male voice/);
  });
});

describe("bolna:check", () => {
  test("reads only (GET), prints wallet, agents and header NAMES, never values", async () => {
    vi.stubEnv("BOLNA_API_KEY", KEY);
    const fake = fakeBolna();
    await syncAgents(fake.client, configsFor("dev"), SITE);
    fake.requests.length = 0;
    const out: string[] = [];
    const ids = Object.fromEntries([...fake.agents.keys()].map((id, i) => [ROUNDS[i], id]));
    for (const r of ROUNDS) vi.stubEnv(`BOLNA_${r.toUpperCase()}_AGENT_ID`, ids[r]);
    expect(await checkMain([], (s) => out.push(s), fake.client)).toBe(0);
    expect(fake.requests.every((r) => r.method === "GET")).toBe(true);
    const text = out.join("\n");
    expect(text).toMatch(/wallet 4\.2 · concurrency 0\/2/);
    expect(text).toMatch(/header names: Content-Type, x-molbhav-secret/);
    expect(text).toMatch(/tools: report_quote \(custom_task\)/);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("team@example.com");
  });

  test("flags an agent with a transfer tool or Bolna rescheduling", () => {
    const lines = describeAgent({ tasks: [{ tools_config: { api_tools: { tools: [{ name: "transfer_call", key: "transfer_call" }] } }, task_config: { auto_reschedule: true } }] });
    expect(lines.join("\n")).toMatch(/PROBLEMS: has transfer_call; auto_reschedule is on/);
  });
});
