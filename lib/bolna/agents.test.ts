import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { USER_DATA_KEYS } from "./userData";
import { CALL_TERMINATE_SEC } from "./status";
import {
  agentProblems,
  buildAgentConfigs,
  CallScriptError,
  ELEVENLABS_VOICE,
  fillPlaceholders,
  parseCallScript,
  PLACEHOLDER,
  ROUNDS,
  transcriberKeywords,
  withVoice,
} from "./agents";

const CALL_SCRIPT = readFileSync(fileURLToPath(new URL("../../docs/CALL_SCRIPT.md", import.meta.url)), "utf8");
const committed = (r: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../bolna/agents/${r}.json`, import.meta.url)), "utf8"));

describe("the agents are built from docs/CALL_SCRIPT.md (R12)", () => {
  const built = buildAgentConfigs(CALL_SCRIPT);

  test("bolna/agents/*.json are exactly what `pnpm bolna:build` makes from the current CALL_SCRIPT.md", () => {
    for (const r of ROUNDS) expect(committed(r)).toEqual(JSON.parse(JSON.stringify(built[r])));
  });

  test("shared settings come from the doc (C6)", () => {
    expect(parseCallScript(CALL_SCRIPT).shared).toEqual({
      welcomeDelayMs: 700,
      interruptionWords: 3,
      onlineCheckSec: 8,
      onlineCheckMessage: "जी, आप लाइन पे हैं?",
      silenceHangupSec: 20,
    });
    const task = built.quote.agent_config.tasks[0];
    expect(task.task_config).toMatchObject({ welcome_message_delay: 700, number_of_words_for_interruption: 3, trigger_user_online_message_after: 8, hangup_after_silence: 20 });
  });

  test("each agent's cut-off is the doc's, and the watchdog uses the same numbers", () => {
    const script = parseCallScript(CALL_SCRIPT);
    for (const r of ROUNDS) {
      expect(script.agents[r].cutOffSec).toBe(CALL_TERMINATE_SEC[r]);
      expect(built[r].agent_config.tasks[0].task_config.call_terminate).toBe(CALL_TERMINATE_SEC[r]);
    }
  });

  test("the welcome and prompt are the doc's, word for word, plus the shared footer", () => {
    const script = parseCallScript(CALL_SCRIPT);
    for (const r of ROUNDS) {
      expect(built[r].agent_config.agent_welcome_message).toBe(script.agents[r].welcome);
      expect(built[r].agent_prompts.task_1.system_prompt.startsWith(script.agents[r].systemPrompt)).toBe(true);
    }
  });

  test("every {variable} the agents use is one we fill in user_data (or a Bolna system variable)", () => {
    const known = new Set<string>([...USER_DATA_KEYS, "execution_id"]);
    for (const r of ROUNDS) {
      const text = `${built[r].agent_config.agent_welcome_message}\n${built[r].agent_prompts.task_1.system_prompt}`;
      for (const m of text.matchAll(/\{([a-z_]+)\}/g)) expect(known.has(m[1]), `${r}: {${m[1]}}`).toBe(true);
    }
  });

  test("hard rules hold for every agent: report_quote on Match only (R23), no transfer, Bolna retries and rescheduling off (R2, C8)", () => {
    for (const r of ROUNDS) {
      expect(agentProblems(built[r])).toEqual([]);
      const task = built[r].agent_config.tasks[0];
      expect(task.task_config.auto_reschedule).toBe(false);
      const api = task.tools_config.api_tools;
      if (r !== "match") {
        expect(api).toBeNull();
        // No tool means no tool instructions: the prompt must never invite JSON (a tool call was once spoken aloud).
        expect(built[r].agent_prompts.task_1.system_prompt).not.toMatch(/REPORT_QUOTE|report_quote/);
        continue;
      }
      expect(api!.tools_params.report_quote).toMatchObject({ method: "POST", url: `${PLACEHOLDER.siteUrl}/bolna/report-quote` });
      expect(api!.tools_params.report_quote.headers["x-molbhav-secret"]).toBe(PLACEHOLDER.secret);
    }
    const bad = JSON.parse(JSON.stringify(built.match));
    bad.agent_config.tasks[0].tools_config.api_tools.tools.push({ name: "transfer_call", key: "transfer_call" });
    expect(agentProblems(bad).join()).toMatch(/transfer_call/);
    const toolOnQuote = JSON.parse(JSON.stringify(built.quote));
    toolOnQuote.agent_config.tasks[0].tools_config.api_tools = built.match.agent_config.tasks[0].tools_config.api_tools;
    expect(agentProblems(toolOnQuote).join()).toMatch(/only the Match agent/);
  });

  test("R23: Hindi only (no auto-switch to English) on a non-reasoning conversation model", () => {
    for (const r of ROUNDS) {
      const tools = built[r].agent_config.tasks[0].tools_config;
      expect(tools.multilingual_config.enabled).toBe(false);
      expect(tools.llm_agent.llm_config.model).toBe("gpt-4.1-mini");
    }
  });

  test("R20: a calm male Sarvam voice by default; ElevenLabs is a swap", () => {
    const synth = built.quote.agent_config.tasks[0].tools_config.synthesizer;
    expect(synth).toMatchObject({ provider: "sarvam", provider_config: { voice_id: "ashutosh_hi_conversational", model: "bulbul:v4-flash", language: "hi" } });
    const el = withVoice(built.quote, ELEVENLABS_VOICE).agent_config.tasks[0].tools_config;
    expect(el.synthesizer.provider).toBe("elevenlabs");
    expect(el.synthesizer.provider_config).not.toHaveProperty("language");
    expect(el.multilingual_config.languages.en.synthesizer.provider).toBe("elevenlabs");
    expect(built.quote.agent_config.tasks[0].tools_config.transcriber).toMatchObject({ provider: "sarvam", model: "saaras:v4", language: "hi" });
  });

  test("Sarvam keyterms stay inside its limits (50 terms, 64 characters)", () => {
    const k = transcriberKeywords();
    expect(k.length).toBeLessThanOrEqual(50);
    expect(k.every((t) => t.length <= 64)).toBe(true);
  });

  test("placeholders are filled at sync time, and a bad value or a leftover placeholder is refused", () => {
    const filled = fillPlaceholders(built.quote, { siteUrl: "https://happy-otter-123.convex.site", secret: "x".repeat(32), target: "dev" });
    const text = JSON.stringify(filled);
    expect(text).not.toContain("@@");
    expect(filled.agent_config.agent_name).toBe("Molbhav Quote [dev]");
    expect(filled.agent_config.webhook_url).toBe(`https://happy-otter-123.convex.site/bolna/webhook?token=${"x".repeat(32)}`);
    expect(() => fillPlaceholders(built.quote, { siteUrl: "http://evil.example", secret: "x".repeat(32), target: "dev" })).toThrow();
    // Production lives in a region: its site URL has a region label.
    expect(fillPlaceholders(built.quote, { siteUrl: "https://cheery-tortoise-144.eu-west-1.convex.site", secret: "x".repeat(32), target: "prod" }).agent_config.webhook_url).toMatch(/^https:\/\/cheery-tortoise-144\.eu-west-1\.convex\.site\/bolna\/webhook\?token=/);
    expect(() => fillPlaceholders(built.quote, { siteUrl: "https://a.b.c.convex.site", secret: "x".repeat(32), target: "prod" })).toThrow();
    expect(() => fillPlaceholders(built.quote, { siteUrl: "https://a.convex.site", secret: "short", target: "dev" })).toThrow();
  });

  test("a CALL_SCRIPT.md that lost a section fails loudly", () => {
    expect(() => parseCallScript(CALL_SCRIPT.replace("### System prompt", "### Prompt"))).toThrow(CallScriptError);
    expect(() => parseCallScript(CALL_SCRIPT.replace("## Agent 3: Match", "## Agent 3: Matching"))).toThrow(CallScriptError);
    expect(() => parseCallScript(CALL_SCRIPT.replace("| Welcome delay | 700 ms", "| Welcome delay | short"))).toThrow(CallScriptError);
  });
});
