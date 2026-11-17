import "server-only";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { checkBotId } from "botid/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getLang } from "../i18n/server";
import { hashIp } from "./hash";
import { llmConfigured, parseOrder } from "./llm";
import type { TtsDeps } from "./readbackAudio";
import { sarvamConfigured, synthesize, transcribe } from "./sarvam";
import type { VoiceOrderDeps } from "./voiceOrder";

// The real outside world for POST /api/voice/order and POST /api/tts: Vercel BotID, the Convex Auth token
// (every Convex call runs AS THE USER, §5), the `lang` cookie, Sarvam and OpenAI. Names of missing env vars
// are logged; values never are.

const MIN_SECRET_LENGTH = 32;

function serverSecret(): string | null {
  const s = process.env.CONVEX_SERVER_SECRET ?? "";
  return s.length >= MIN_SECRET_LENGTH ? s : null;
}

function baseMissing(): string | null {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return "NEXT_PUBLIC_CONVEX_URL";
  if (serverSecret() === null) return "CONVEX_SERVER_SECRET";
  return null;
}

/** The client's address as Vercel's edge reports it (it overwrites these headers, so clients can't spoof them). */
function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

const isBot = async () => (await checkBotId()).isBot;
const token = async () => await convexAuthNextjsToken();
const log = (entry: Record<string, unknown>) => console.info(JSON.stringify(entry));
const now = () => Date.now();

export function voiceOrderDeps(): VoiceOrderDeps {
  return {
    isBot,
    token,
    lang: getLang,
    ipHash: (req) => {
      try {
        return hashIp(clientIp(req));
      } catch {
        return null; // HASH_SECRET unset
      }
    },
    missingConfig: (input) => {
      const base = baseMissing();
      if (base !== null) return base;
      if (input === "audio" && !sarvamConfigured()) return "SARVAM_API_KEY";
      if (!llmConfigured()) return "OPENAI_API_KEY";
      return null;
    },
    consume: async (kind, ipHash, tok) =>
      await fetchMutation(api.limits.consumeVoice, { serverSecret: serverSecret() ?? "", kind, ipHash }, { token: tok }),
    transcribe: async (audio, lang, signal) => (await transcribe(audio, lang, { signal })).transcript,
    parse: async (transcript, city, signal) => await parseOrder(transcript, city, { signal }),
    createDraft: async (args, tok) => await fetchMutation(api.orders.createDraft, args, { token: tok }),
    log,
    now,
    // The /try sandbox (G3): its own limits and draft, still as the visitor and with the server secret.
    consumeSandbox: async (kind, ipHash, tok) =>
      await fetchMutation(api.limits.consumeSandbox, { serverSecret: serverSecret() ?? "", kind, ipHash }, { token: tok }),
    createSandboxDraft: async (args, tok) => await fetchMutation(api.sandbox.createDraft, { serverSecret: serverSecret() ?? "", ...args }, { token: tok }),
    // The canned demo-line parse, on the demo deployment's Vercel project only (Phase 7 item 4).
    demoFallback: () => process.env.DEMO_DEPLOYMENT === "true",
  };
}

export function ttsDeps(): TtsDeps {
  return {
    isBot,
    token,
    lang: getLang,
    missingConfig: () => baseMissing() ?? (sarvamConfigured() ? null : "SARVAM_API_KEY"),
    readBack: async (draftId, tok) => await fetchQuery(api.orders.readBack, { orderId: draftId as Id<"orders"> }, { token: tok }),
    consume: async (ttsChars, tok) =>
      await fetchMutation(api.limits.consumeVoice, { serverSecret: serverSecret() ?? "", kind: "tts", ttsChars }, { token: tok }),
    synthesize: async (text, lang, signal) => await synthesize(text, lang, { signal }),
    log,
    now,
  };
}
