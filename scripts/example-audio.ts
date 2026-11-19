// Records Home's example order in our own voice (Sarvam Bulbul, the read-back's male voices, R20) as static
// MP3s: public/audio/example-hi.mp3 and example-en.mp3. The "सुनिए" button plays these, so it works on every
// phone (the browser's own voice is often missing for Hindi and stays silent). Re-run after changing
// DEMO_TRANSCRIPT. Needs SARVAM_API_KEY (.env.local). Usage: pnpm tsx --env-file=.env.local scripts/example-audio.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { DEMO_TRANSCRIPT } from "../lib/fixtures/demoOrder";

const SPEAKERS = { hi: process.env.SARVAM_TTS_SPEAKER?.trim() || "ashutosh_hi_conversational", en: process.env.SARVAM_TTS_SPEAKER_EN?.trim() || "dev_en_conversational" };
const MODEL = process.env.SARVAM_TTS_MODEL?.trim() || "bulbul:v4-flash";

async function main() {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw new Error("SARVAM_API_KEY is not set (.env.local)");
  for (const lang of ["hi", "en"] as const) {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: DEMO_TRANSCRIPT[lang],
        language_code: lang === "en" ? "en-IN" : "hi-IN",
        model: MODEL,
        speaker: SPEAKERS[lang],
        output_audio_codec: "mp3",
        speech_sample_rate: 24000,
      }),
    });
    if (!res.ok) throw new Error(`sarvam ${lang}: HTTP ${res.status}`);
    const body = (await res.json()) as { audios?: string[] };
    const audio = Buffer.concat((body.audios ?? []).map((b) => Buffer.from(b, "base64")));
    if (audio.length === 0) throw new Error(`sarvam ${lang}: no audio`);
    const out = path.join(process.cwd(), "public/audio", `example-${lang}.mp3`);
    writeFileSync(out, audio);
    console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(audio.length / 1024)} KB)`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
