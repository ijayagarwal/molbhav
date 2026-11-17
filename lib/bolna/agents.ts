// The four Bolna agents as data (docs/CALL_SCRIPT.md, DECISIONS C1–C8, R2, R12, R20). Pure.
//
// `buildAgentConfigs(callScriptMarkdown)` turns docs/CALL_SCRIPT.md into the request bodies for Bolna's agent
// API (POST /v2/agent, PUT /v2/agent/{id}; https://www.bolna.ai/docs/api-reference/agent/v2/create). The
// welcomes, system prompts, cut-offs and the shared settings (welcome delay, interruption, online check,
// silence hangup) are READ from CALL_SCRIPT.md, so editing the doc and running `pnpm bolna:build` is how an
// agent changes; a doc whose shape changed fails loudly instead of syncing a half-built agent.
// bolna/agents/*.json are this output, committed; `pnpm bolna:sync` fills the placeholders below (the Convex
// site URL, the webhook secret, the deployment) at sync time, so no secret is ever committed.
//
// What the config holds, and why:
// - Tools: report_quote only (CALL_SCRIPT "Tools"). Never transfer_call or anything that dials, books or messages.
// - Bolna-side retries and rescheduling stay off (R2): `auto_reschedule: false`, no `calling_guardrails` (which
//   would reschedule calls outside hours), and every POST /call sends `retry_config: { enabled: false }`.
// - Voice (R20): a calm male Sarvam Bulbul v4 Flash voice; `pnpm bolna:sync --voice elevenlabs` swaps in an
//   ElevenLabs male voice for the comparison on the number test (CALL_SCRIPT "Number test").
// - Hindi + English auto-switch (C7): `multilingual_config` with Hindi first; the welcome is always the Hindi one.
import { BRAND_TIERS } from "../config";
import type { Round } from "../domain";

export const ROUNDS: readonly Round[] = ["quote", "haggle", "match", "confirm"];

/** Filled in by `pnpm bolna:sync`; the sync refuses to send a body that still contains one. */
export const PLACEHOLDER = {
  siteUrl: "@@CONVEX_SITE_URL@@",
  secret: "@@BOLNA_WEBHOOK_SECRET@@",
  target: "@@MOLBHAV_TARGET@@",
} as const;

export interface ScriptAgent {
  welcome: string;
  systemPrompt: string;
  /** Hard cut-off in seconds (`call_terminate`), from the table at the top of CALL_SCRIPT.md. */
  cutOffSec: number;
}

export interface SharedSettings {
  welcomeDelayMs: number;
  interruptionWords: number;
  onlineCheckSec: number;
  onlineCheckMessage: string;
  silenceHangupSec: number;
}

export interface CallScript {
  agents: Record<Round, ScriptAgent>;
  shared: SharedSettings;
}

export class CallScriptError extends Error {}

const HEADING: Record<Round, RegExp> = {
  quote: /^## Agent \d+: Quote\b/,
  haggle: /^## Agent \d+: Haggle\b/,
  match: /^## Agent \d+: Match\b/,
  confirm: /^## Agent \d+: Confirm\b/,
};
const TABLE_NAME: Record<Round, string> = { quote: "Quote", haggle: "Haggle", match: "Match", confirm: "Confirm" };

/** The fenced block right after `### <title>` inside the agent's section. */
function block(lines: string[], from: number, to: number, title: string): string {
  const head = lines.findIndex((l, i) => i > from && i < to && l.trim() === `### ${title}`);
  if (head < 0) throw new CallScriptError(`missing "### ${title}"`);
  const open = lines.findIndex((l, i) => i > head && l.trim().startsWith("```"));
  const close = lines.findIndex((l, i) => i > open && l.trim() === "```");
  if (open < 0 || close < 0 || close > to) throw new CallScriptError(`no code block after "### ${title}"`);
  return lines.slice(open + 1, close).join("\n").trim();
}

function settingRow(md: string, name: string): string {
  const m = new RegExp(`^\\| ${name} \\| (.+) \\|\\s*$`, "m").exec(md);
  if (!m) throw new CallScriptError(`missing the "${name}" row in Shared Bolna settings`);
  return m[1];
}

function num(text: string, re: RegExp, what: string): number {
  const m = re.exec(text);
  if (!m) throw new CallScriptError(`can't read ${what} from "${text}"`);
  return Number(m[1]);
}

/** Reads the four agents and the shared settings from docs/CALL_SCRIPT.md. */
export function parseCallScript(md: string): CallScript {
  const lines = md.split("\n");
  const starts = ROUNDS.map((r) => {
    const i = lines.findIndex((l) => HEADING[r].test(l));
    if (i < 0) throw new CallScriptError(`missing the "${TABLE_NAME[r]}" agent section`);
    return i;
  });
  const agents = {} as Record<Round, ScriptAgent>;
  ROUNDS.forEach((round, k) => {
    const from = starts[k];
    const nextSection = lines.findIndex((l, i) => i > from && /^## /.test(l));
    const to = nextSection < 0 ? lines.length : nextSection;
    const row = new RegExp(`^\\| ${TABLE_NAME[round]} \\|.*\\| (\\d+) s / (\\d+) s \\|\\s*$`, "m").exec(md);
    if (!row) throw new CallScriptError(`missing the target / cut-off for ${TABLE_NAME[round]}`);
    agents[round] = { welcome: block(lines, from, to, "Welcome"), systemPrompt: block(lines, from, to, "System prompt"), cutOffSec: Number(row[2]) };
  });
  const online = settingRow(md, "Online check");
  const quoted = /"([^"]+)"/.exec(online);
  if (!quoted) throw new CallScriptError("the Online check row has no quoted message");
  return {
    agents,
    shared: {
      welcomeDelayMs: num(settingRow(md, "Welcome delay"), /(\d+)\s*ms/, "the welcome delay"),
      interruptionWords: num(settingRow(md, "Interruption"), /(\d+)\s*words?/, "the interruption threshold"),
      onlineCheckSec: num(online, /(\d+)\s*s\b/, "the online check"),
      onlineCheckMessage: quoted[1],
      silenceHangupSec: num(settingRow(md, "Silence hangup"), /^(\d+)\s*s\b/, "the silence hangup"),
    },
  };
}

// ── Voices (R20) ───────────────────────────────────────────────────────────────────────

export type VoiceChoice = "sarvam" | "elevenlabs";

export interface VoiceSpec {
  provider: VoiceChoice;
  /** Hindi (the call's language) and English (after an auto-switch). */
  hi: { voice: string; voiceId: string };
  en: { voice: string; voiceId: string };
  model: string;
}

/** R20: Sarvam Bulbul v4 Flash, calm male personas (the same as the app's read-back). */
export const SARVAM_VOICE: VoiceSpec = {
  provider: "sarvam",
  model: "bulbul:v4-flash",
  hi: { voice: "Ashutosh (Conversational)", voiceId: "ashutosh_hi_conversational" },
  en: { voice: "Dev (Conversational)", voiceId: "dev_en_conversational" },
};

/**
 * The ElevenLabs comparison voice: "Raju - Natural Conversationalist" (Indian, male), the male Indian voice in
 * Bolna's ElevenLabs examples, on Eleven v4 Turbo (74 languages incl. Hindi; https://www.bolna.ai/docs/elevenlabs-voice).
 * Overridable with BOLNA_ELEVENLABS_VOICE_ID / BOLNA_ELEVENLABS_MODEL; the sync checks it against Bolna's catalogue.
 */
export const ELEVENLABS_VOICE: VoiceSpec = {
  provider: "elevenlabs",
  model: "eleven_v4_turbo",
  hi: { voice: "Raju - Natural Conversationalist", voiceId: "pzxut4zZz4GImZNlqQ3H" },
  en: { voice: "Raju - Natural Conversationalist", voiceId: "pzxut4zZz4GImZNlqQ3H" },
};

function synthesizer(v: VoiceSpec, lang: "hi" | "en") {
  const pick = v[lang];
  if (v.provider === "sarvam") {
    return {
      provider: "sarvam",
      provider_config: { voice: pick.voice, voice_id: pick.voiceId, model: v.model, language: lang, speed: 1 },
      stream: true,
      buffer_size: 150,
      audio_format: "wav",
      caching: true,
    };
  }
  // ElevenLabs takes no `language` in provider_config (Bolna create-agent docs).
  return {
    provider: "elevenlabs",
    provider_config: { voice: pick.voice, voice_id: pick.voiceId, model: v.model },
    stream: true,
    buffer_size: 250,
    audio_format: "wav",
    caching: true,
  };
}

// ── The shared pieces every agent gets ─────────────────────────────────────────────────

/** Spoken while report_quote runs (CALL_SCRIPT: "जी, एक सेकंड, नोट कर रहे हैं"). */
export const REPORT_FILLER = "जी, एक सेकंड, नोट कर रहे हैं।";

/** Terms the transcriber is biased towards (Sarvam saaras:v4 keyterms: at most 50, 64 characters each). */
export function transcriberKeywords(): string[] {
  const t = BRAND_TIERS.Jaipur;
  const terms = [
    "TMT", "Fe500D", "Fe550D", "Fe500", "PPC", "OPC", "ISI", "GST", "mm", "सरिया", "सीमेंट", "बोरी", "कट्टा", "क्विंटल", "टन", "किलो",
    "भाड़ा", "उतराई", "हमाली", "कांटा", "पक्का बिल", "कच्चा बिल", "उधार", "कैश",
    ...t.steelBranded, ...t.steelLocalIsi, ...t.cementBranded,
  ];
  return [...new Set(terms)].slice(0, 50);
}

const TRANSCRIBER_CONTEXT =
  "Phone call from a buyer's AI assistant to a building-material dealer in Jaipur, India. The dealer quotes TMT steel (सरिया) and cement rates in Hindi or Hinglish: rupees per kg, quintal, ton or bag, GST, delivery (भाड़ा) and unloading (उतराई) charges, credit days (उधार).";

/**
 * Appended to every system prompt: the variables the prompts can't name themselves and how report_quote's
 * fields are filled. Technical glue only; the rules agents follow are CALL_SCRIPT.md's.
 */
const SPEAKING_RULES = [
  // Hard rule 3 / CALL_SCRIPT rule 2, made concrete: a first live test produced "मैं … बोल रहा हूँ" despite the rule.
  "HOW TO SPEAK ABOUT YOURSELF (strict): speak as हम (we) or impersonally, never as मैं with a gendered verb. " +
    "Say \"ये मोलभाव से AI कॉल है\", \"हम {contractor_name} जी के लिए रेट ले रहे हैं\", \"जी, नोट कर लिया\", \"धन्यवाद जी\". " +
    "Never say \"बोल रहा हूँ\", \"बोल रही हूँ\", \"पूछ रहा/रही हूँ\", \"मैं ठीक हूँ\", \"असिस्टेंट हूँ\". " +
    "If asked who is calling: \"जी, ये मोलभाव का AI सहायक है, {contractor_name} जी के लिए रेट ले रहे हैं।\" Small talk: answer in one short line, then return to the order.",
  "BUYER'S NUMBER: if the dealer asks for {contractor_name} जी's number and {contractor_phone_spoken} is not empty, say it slowly, digit by digit, then once more: {contractor_phone_spoken}. " +
    "If it is empty: \"जी, ऑर्डर पक्का होते ही {contractor_name} जी खुद आपसे बात कर लेंगे।\" Never give any other number.",
];
const CALL_REFERENCE = "CALL REFERENCE: {molbhav_call_id}. Item keys for report_quote: {item_keys}.";

/** Quote, Haggle and Confirm (no tools, R23): the speaking rules and the call reference only. Never mention a tool. */
export const PROMPT_FOOTER_NO_TOOL = [...SPEAKING_RULES, "CALL REFERENCE: {molbhav_call_id}. You have no tools: never write JSON, braces or code; only speak."].join("\n");

export const PROMPT_FOOTER = [
  ...SPEAKING_RULES,
  CALL_REFERENCE,
  "REPORT_QUOTE: call it exactly when the instructions above say so. Send only figures the dealer himself said, written as digits (सत्तावन → 57, सड़सठ हज़ार → 67000, साढ़े पाँच हज़ार → 5500). " +
    "rates: one entry per item he quoted, separated by ';', each as <item key>:<rate>:<kg|quintal|ton|bag>:<extra|included|unknown> (the GST mode he said). " +
    "brand: <item key>:<brand he named>, separated by ';'. stock: full, partial, none or unknown. delivery and unloading: rupees as digits, or free; leave empty if he didn't say. " +
    "credit_days: days as digits, or cash. bill: pakka or kachcha. weight_basis: kanta or standard. all_in_said: only if he said one all-in figure himself, as digits; otherwise leave it empty. " +
    "NEVER send a total you added up yourself. For a callback, declined call or opt-out send stage outcome with the outcome (and callback_when: the time he gave, in his words).",
].join("\n");

const CALL_COMPLETE_PROMPT =
  "Decide whether this phone call is complete. It is complete if the assistant has already said its closing thank-you line (it starts with धन्यवाद), " +
  "or the dealer refused to talk, asked not to be called again, or asked to be called back later and the assistant has thanked him. Otherwise it is not complete.";

function reportQuoteTool() {
  const p = (description: string) => ({ type: "string", description });
  return {
    tools: [
      {
        name: "report_quote",
        key: "custom_task",
        description:
          "Record what the dealer said on this call. Call it once after the dealer says हाँ to your final read-back (stage final). " +
          "The Match agent also calls it once right after the dealer confirms the read-back of his first full quote, before naming any other number (stage first); " +
          "its reply says cite=true or cite=false. Also call it with stage outcome when the dealer declines, asks for a callback or says not to call again, " +
          "and on the Confirm agent with outcome confirmed or terms_changed. Send only the dealer's own figures, never a total you worked out.",
        pre_call_message: REPORT_FILLER,
        parameters: {
          type: "object",
          properties: {
            molbhav_call_id: p("This call's reference: {molbhav_call_id}. Send it exactly."),
            stage: p("first, final or outcome."),
            outcome: p("quoted, callback, declined, opt_out, confirmed or terms_changed."),
            rates: p("Per item, separated by ';': <item key>:<rate as digits>:<kg|quintal|ton|bag>:<extra|included|unknown>. Item keys: {item_keys}."),
            brand: p("Per item, separated by ';': <item key>:<brand the dealer named>."),
            stock: p("full, partial, none or unknown."),
            delivery: p("Delivery (भाड़ा) in rupees as digits, or free. Empty if not said."),
            unloading: p("Unloading (उतराई) in rupees as digits, or free. Empty if not said."),
            credit_days: p("Credit days as digits, or cash. Empty if not said."),
            bill: p("pakka or kachcha. Empty if not said."),
            weight_basis: p("kanta or standard. Empty if not said."),
            all_in_said: p("Only if the dealer himself said one all-in figure: that figure as digits. Otherwise empty."),
            callback_when: p("For a callback: the time the dealer gave, in his words."),
          },
          required: ["molbhav_call_id", "stage"],
        },
      },
    ],
    tools_params: {
      report_quote: {
        method: "POST",
        url: `${PLACEHOLDER.siteUrl}/bolna/report-quote`,
        api_token: null,
        headers: { "Content-Type": "application/json", "x-molbhav-secret": PLACEHOLDER.secret },
        param: Object.fromEntries(
          ["molbhav_call_id", "stage", "outcome", "rates", "brand", "stock", "delivery", "unloading", "credit_days", "bill", "weight_basis", "all_in_said", "callback_when"].map((k) => [k, `%(${k})s`]),
        ),
      },
    },
  };
}

export interface BuildOptions {
  voice?: VoiceSpec;
  /** Bolna `input`/`output` telephony provider; the trial's own numbers and Plivo use wav. */
  telephony?: "plivo" | "exotel" | "vobiz" | "twilio";
}

/** The agent's display name in Bolna; `bolna:sync` finds an existing agent by it. */
export function agentName(round: Round, target: string): string {
  return `Molbhav ${round[0].toUpperCase()}${round.slice(1)} [${target}]`;
}

/** One agent's request body for POST /v2/agent and PUT /v2/agent/{id}. */
export function buildAgentConfig(round: Round, script: CallScript, opts: BuildOptions = {}) {
  const voice = opts.voice ?? SARVAM_VOICE;
  const telephony = opts.telephony ?? "plivo";
  const a = script.agents[round];
  const s = script.shared;
  // report_quote exists only on the Match agent (R23), so only its prompt carries the tool instructions.
  const prompt = `${a.systemPrompt}\n\n${round === "match" ? PROMPT_FOOTER : PROMPT_FOOTER_NO_TOOL}`;
  return {
    agent_config: {
      agent_name: agentName(round, PLACEHOLDER.target),
      agent_welcome_message: a.welcome,
      // The secret rides in the URL: Bolna's agent API can't set webhook headers (convex/bolnaHttp.ts checkSecret).
      webhook_url: `${PLACEHOLDER.siteUrl}/bolna/webhook?token=${PLACEHOLDER.secret}`,
      agent_type: "other",
      call_summary_enabled: false,
      tasks: [
        {
          task_type: "conversation",
          toolchain: { execution: "sequential", pipelines: [["transcriber", "llm", "synthesizer"]] },
          tools_config: {
            llm_agent: {
              agent_type: "simple_llm_agent",
              agent_flow_type: "streaming",
              // R23: a non-reasoning model for the live conversation: it follows the step list and makes clean tool calls
              // (gpt-5.4-mini skipped steps and once spoke a tool call aloud). Parse and extraction stay on R19's model.
              llm_config: { provider: "openai", model: "gpt-4.1-mini", max_tokens: 200, temperature: 0.2 },
            },
            synthesizer: synthesizer(voice, "hi"),
            transcriber: {
              provider: "sarvam",
              model: "saaras:v4",
              language: "hi",
              stream: true,
              endpointing: 500,
              keywords: transcriberKeywords().join(","),
              context: TRANSCRIBER_CONTEXT,
            },
            input: { provider: telephony, format: "wav" },
            output: { provider: telephony, format: "wav" },
            api_tools: round === "match" ? reportQuoteTool() : null,
            // R23: Hindi only. Auto-switching to English misfired on unclear Hindi in the first live tests.
            multilingual_config: {
              enabled: false,
              active_language: "hi",
              language_switch_trigger: "requested_or_auto_detected",
              languages: {
                hi: { synthesizer: synthesizer(voice, "hi"), system_prompt: prompt, handoff_message: "जी, हिंदी में बात करते हैं।" },
                en: { transcriber: { language: "en" }, synthesizer: synthesizer(voice, "en"), system_prompt: prompt, handoff_message: "Sure, we can talk in English." },
              },
            },
          },
          task_config: {
            hangup_after_silence: s.silenceHangupSec,
            incremental_delay: 400,
            number_of_words_for_interruption: s.interruptionWords,
            hangup_after_LLMCall: true,
            call_cancellation_prompt: CALL_COMPLETE_PROMPT,
            backchanneling: false,
            ambient_noise: false,
            call_terminate: a.cutOffSec,
            voicemail: false,
            dtmf_enabled: false,
            auto_reschedule: false,
            welcome_message_delay: s.welcomeDelayMs,
            check_if_user_online: true,
            trigger_user_online_message_after: s.onlineCheckSec,
            check_user_online_message: { hi: s.onlineCheckMessage, en: "Are you still on the line?" },
            call_hangup_message: null,
            interruptible_hangup_message: false,
          },
        },
      ],
    },
    agent_prompts: { task_1: { system_prompt: prompt } },
  };
}

export type AgentConfig = ReturnType<typeof buildAgentConfig>;

export function buildAgentConfigs(callScriptMd: string, opts: BuildOptions = {}): Record<Round, AgentConfig> {
  const script = parseCallScript(callScriptMd);
  return Object.fromEntries(ROUNDS.map((r) => [r, buildAgentConfig(r, script, opts)])) as Record<Round, AgentConfig>;
}

/** Fills the placeholders. Throws if one is left, so a template can never reach Bolna. */
export function fillPlaceholders(config: AgentConfig, values: { siteUrl: string; secret: string; target: string }): AgentConfig {
  if (!/^https:\/\/[a-z0-9-]+\.convex\.site$/.test(values.siteUrl)) throw new Error("site URL must be https://<deployment>.convex.site");
  if (values.secret.length < 24) throw new Error("BOLNA_WEBHOOK_SECRET must be at least 24 characters");
  if (!/^[a-z0-9-]{1,20}$/.test(values.target)) throw new Error("target must be a short name like dev, demo or prod");
  const text = JSON.stringify(config)
    .replaceAll(PLACEHOLDER.siteUrl, values.siteUrl)
    .replaceAll(PLACEHOLDER.secret, values.secret)
    .replaceAll(PLACEHOLDER.target, values.target);
  if (text.includes("@@")) throw new Error("an unfilled placeholder is left in the agent config");
  return JSON.parse(text) as AgentConfig;
}

/** Swaps every synthesizer (the base and each language's) for another voice. */
export function withVoice(config: AgentConfig, voice: VoiceSpec): AgentConfig {
  const c = JSON.parse(JSON.stringify(config)) as AgentConfig;
  const tools = c.agent_config.tasks[0].tools_config;
  tools.synthesizer = synthesizer(voice, "hi");
  tools.multilingual_config.languages.hi.synthesizer = synthesizer(voice, "hi");
  tools.multilingual_config.languages.en.synthesizer = synthesizer(voice, "en");
  return c;
}

/**
 * What must hold for every agent we send (hard rules 2 and 3, R2, C8). The sync checks it before any request,
 * and the tests check the committed configs. Returns the problems found (empty when fine).
 */
export function agentProblems(config: AgentConfig): string[] {
  const out: string[] = [];
  const text = JSON.stringify(config);
  if (/transfer_call/i.test(text)) out.push("contains transfer_call");
  if (/calling_guardrails/.test(text)) out.push("has calling_guardrails (Bolna would reschedule calls)");
  if (/retry_config/.test(text)) out.push("has a retry_config");
  const task = config.agent_config.tasks[0];
  if (task.task_config.auto_reschedule !== false) out.push("auto_reschedule is not off");
  // R23: report_quote on the Match agent only; every other agent has no tools at all.
  const api = task.tools_config.api_tools;
  const isMatch = config.agent_config.agent_name.startsWith("Molbhav Match ");
  if (!isMatch) {
    if (api !== null) out.push("only the Match agent may have a tool");
  } else if (api === null) {
    out.push("the Match agent needs report_quote");
  } else {
    const tools = api.tools;
    if (tools.length !== 1 || tools[0].name !== "report_quote" || tools[0].key !== "custom_task") out.push("tools must be report_quote only");
    if (Object.keys(api.tools_params).join() !== "report_quote") out.push("tools_params must be report_quote only");
    if (!api.tools_params.report_quote.url.endsWith("/bolna/report-quote")) out.push("report_quote points elsewhere");
  }
  if (!/\/bolna\/webhook\?token=[^&]+$/.test(config.agent_config.webhook_url)) out.push("the webhook points elsewhere or has no token");
  return out;
}
