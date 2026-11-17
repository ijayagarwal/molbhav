import "server-only";
import { BRAND_TIERS, CITY_AREAS } from "../config";
import { PARSE_CEMENT_TYPES, PARSE_GRADES } from "../llm/parsePrompt";

// Sarvam speech APIs for the Next.js voice routes (ARCHITECTURE §6.1, §7; DECISIONS F3, V3, B6).
// Checked against docs.sarvam.ai (November 2026):
// - STT: POST https://api.sarvam.ai/speech-to-text, multipart `file`, `model` (saaras:v4 is the default and
//   latest), `mode` (codemix: English words in Latin, Hindi in Devanagari), `language_code`, and `keyterms`
//   (a JSON array, at most 50 terms of 64 characters, saaras:v4 only). REST audio is for clips under 30 s.
//   ₹0.49 a minute, billed per second.
// - TTS: POST https://api.sarvam.ai/text-to-speech, JSON { text (max 2,500 chars), language_code, model
//   "bulbul:v4-flash", speaker (a v4 persona id `name_lang_style`; v3 short names are rejected),
//   output_audio_codec, speech_sample_rate } → { audios: [base64] }. ₹1 per 1,000 characters.
// - Auth: the `api-subscription-key` header. Pay-as-you-go limits: 60 requests a minute each for STT and TTS.
// The audio is sent and dropped: nothing here stores it (B6). Errors never include the key.

export const SARVAM_BASE_URL = "https://api.sarvam.ai";
export const SARVAM_DEFAULTS = {
  sttModel: "saaras:v4",
  ttsModel: "bulbul:v4-flash",
  /**
   * A calm, mature male voice (the founders' choice, R20): Sarvam's docs rank `ashutosh` among the best male
   * Hindi voices; `dev` is the male English conversational persona. Checked against the live list, 17 Nov 2026.
   */
  ttsSpeakerHi: "ashutosh_hi_conversational",
  ttsSpeakerEn: "dev_en_conversational",
} as const;
export const STT_TIMEOUT_MS = 8_000;
export const TTS_TIMEOUT_MS = 8_000;
export const TTS_MAX_CHARS = 2_500;

export type SarvamErrorKind = "not_configured" | "timeout" | "network" | "http" | "bad_response" | "invalid_input";

/** A failed Sarvam call. `status` and `code` come from Sarvam's error body, never the request. */
export class SarvamError extends Error {
  constructor(
    readonly kind: SarvamErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SarvamError";
  }
}

export interface SarvamOptions {
  /** For tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function apiKey(): string {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw new SarvamError("not_configured", "SARVAM_API_KEY is not set");
  return key;
}

/** Whether STT and TTS can run (the routes answer `not_configured` before spending anything otherwise). */
export function sarvamConfigured(): boolean {
  return (process.env.SARVAM_API_KEY?.trim() ?? "") !== "";
}

/**
 * Terms that bias recognition toward our domain (saaras:v4 keyterms): brands from the config list, grades,
 * cement types, the trade words, and the city's areas. At most 50, each at most 64 characters.
 */
export function sttKeyterms(): string[] {
  const t = BRAND_TIERS.Jaipur;
  const terms = [
    ...t.steelBranded,
    ...t.steelLocalIsi,
    ...t.cementBranded,
    ...PARSE_GRADES,
    ...PARSE_CEMENT_TYPES.map((c) => c.replace(/^OPC/, "OPC ")),
    "TMT",
    "ISI",
    "sariya",
    "bori",
    "katta",
    "udhaar",
    ...CITY_AREAS.Jaipur.map((a) => a.en),
  ];
  return [...new Set(terms)].filter((x) => x.length <= 64).slice(0, 50);
}

function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return outer === undefined ? t : AbortSignal.any([t, outer]);
}

async function call(path: string, init: RequestInit, opts: SarvamOptions, defaultTimeout: number): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${SARVAM_BASE_URL}${path}`, { ...init, signal: timeoutSignal(opts.timeoutMs ?? defaultTimeout, opts.signal), cache: "no-store" });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new SarvamError("timeout", `sarvam ${path}: timed out`);
    throw new SarvamError("network", `sarvam ${path}: network error`);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: unknown } } | null)?.error;
    const code = typeof err?.code === "string" ? err.code : undefined;
    throw new SarvamError("http", `sarvam ${path}: HTTP ${res.status}${code ? ` (${code})` : ""}`, res.status, code);
  }
  if (body === null) throw new SarvamError("bad_response", `sarvam ${path}: not JSON`);
  return body;
}

/** "audio/webm;codecs=opus" → ["audio/webm", "webm"]: the base type and a file name extension. */
export function audioFileType(mime: string): { type: string; ext: string } {
  const type = mime.split(";")[0].trim().toLowerCase() || "application/octet-stream";
  const ext: Record<string, string> = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/flac": "flac",
  };
  return { type, ext: ext[type] ?? "bin" };
}

export interface Transcript {
  transcript: string;
  languageCode: string | null;
  requestId: string | null;
}

/** Saaras STT in codemix mode. The audio is streamed to Sarvam and not kept (B6). */
export async function transcribe(audio: Blob, lang: "hi" | "en", opts: SarvamOptions = {}): Promise<Transcript> {
  const key = apiKey();
  const model = process.env.SARVAM_STT_MODEL?.trim() || SARVAM_DEFAULTS.sttModel;
  const { type, ext } = audioFileType(audio.type);
  const form = new FormData();
  form.append("file", new Blob([audio], { type }), `order.${ext}`);
  form.append("model", model);
  form.append("mode", "codemix");
  // Set explicitly: auto-detection needs more signal than a short order gives.
  form.append("language_code", lang === "en" ? "en-IN" : "hi-IN");
  if (model.startsWith("saaras:v4")) form.append("keyterms", JSON.stringify(sttKeyterms()));
  const body = (await call("/speech-to-text", { method: "POST", headers: { "api-subscription-key": key }, body: form }, opts, STT_TIMEOUT_MS)) as {
    transcript?: unknown;
    language_code?: unknown;
    request_id?: unknown;
  };
  if (typeof body.transcript !== "string") throw new SarvamError("bad_response", "sarvam stt: no transcript");
  return {
    transcript: body.transcript,
    languageCode: typeof body.language_code === "string" ? body.language_code : null,
    requestId: typeof body.request_id === "string" ? body.request_id : null,
  };
}

export interface Speech {
  audio: Uint8Array;
  contentType: "audio/mpeg";
}

/** Bulbul v4 Flash TTS → MP3. Only ever called with text built on the server (V3: no endpoint speaks free text). */
export async function synthesize(text: string, lang: "hi" | "en", opts: SarvamOptions = {}): Promise<Speech> {
  const key = apiKey();
  const clean = text.trim();
  if (clean === "" || clean.length > TTS_MAX_CHARS) throw new SarvamError("invalid_input", "sarvam tts: text empty or too long");
  const model = process.env.SARVAM_TTS_MODEL?.trim() || SARVAM_DEFAULTS.ttsModel;
  const speaker =
    lang === "en"
      ? process.env.SARVAM_TTS_SPEAKER_EN?.trim() || SARVAM_DEFAULTS.ttsSpeakerEn
      : process.env.SARVAM_TTS_SPEAKER?.trim() || SARVAM_DEFAULTS.ttsSpeakerHi;
  const body = (await call(
    "/text-to-speech",
    {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: clean,
        language_code: lang === "en" ? "en-IN" : "hi-IN",
        model,
        speaker,
        output_audio_codec: "mp3",
        speech_sample_rate: 24000,
      }),
    },
    opts,
    TTS_TIMEOUT_MS,
  )) as { audios?: unknown };
  const audios = Array.isArray(body.audios) ? body.audios.filter((a): a is string => typeof a === "string" && a !== "") : [];
  if (audios.length === 0) throw new SarvamError("bad_response", "sarvam tts: no audio");
  const parts = audios.map((b64) => Buffer.from(b64, "base64"));
  return { audio: new Uint8Array(Buffer.concat(parts)), contentType: "audio/mpeg" };
}
