// The /try sandbox (DECISIONS G3, ARCHITECTURE §6.9): its limits, its ₹ kill switch and its sample orders.
// Pure: used by convex/limits.ts, convex/sandbox.ts, the voice route (lib/server/voiceOrder.ts) and the /try
// screens. Everything a sandbox order does runs on the simulator with the fictional DEMO dealers.
import type { DeliverBy } from "./domain";
import type { DraftItem } from "./parse";
import type { PersonaKey } from "../convex/sim/personas";

export const SANDBOX = {
  /** A sandbox order (with its calls, events and quotes) is deleted this long after it was made. */
  ttlMs: 24 * 60 * 60 * 1000,
  /** The mic stops at 15 s in the sandbox (DESIGN §13). */
  capMs: 15_000,
  /**
   * The route refuses a clip said to be longer than this: the 15 s cap plus 1 s for the encoder to flush
   * the last chunk after the recorder stops.
   */
  maxDurationMs: 16_000,
  /** 15 s at 24 kbps is ≈ 45 KB; Safari's AAC can run near 128 kbps (≈ 240 KB). Anything bigger is refused. */
  maxAudioBytes: 320 * 1024,
  /** The fictional DEMO personas a sandbox sweep calls (no regular dealer: there is nobody's own dealer to match). */
  personas: ["perkg_gst_extra", "perton_gst_incl", "whatsapp_dodger", "no_answer"] as readonly PersonaKey[],
} as const;

/** The documented default for SANDBOX_DAILY_INR_CAP (whole rupees a day; 0 turns spoken and typed /try orders off). */
export const SANDBOX_DAILY_INR_CAP_DEFAULT = 100;

/**
 * SANDBOX_DAILY_INR_CAP in paise. Unset → the default; a whole number of rupees ≥ 0 → that (0 turns the
 * sandbox's paid path off); anything else → null, and the route refuses (fail closed, like VOICE_DAILY_INR_CAP).
 */
export function sandboxDailyCapPaise(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return SANDBOX_DAILY_INR_CAP_DEFAULT * 100;
  if (!/^\d{1,7}$/.test(raw.trim())) return null;
  return Number(raw.trim()) * 100;
}

// ── Sample orders (G3: chips first, no speech and no LLM, so they work and cost nothing) ──────────

export const SANDBOX_SAMPLE_IDS = ["demo", "cement", "steel"] as const;
export type SandboxSampleId = (typeof SANDBOX_SAMPLE_IDS)[number];

export interface SandboxSample {
  id: SandboxSampleId;
  /** What the chip shows and the draft keeps as its transcript, in the UI language. */
  text: { hi: string; en: string };
  /** Already in lib/parse.ts's sanitized form; what is left unsaid is asked on the sandbox's Confirm. */
  items: DraftItem[];
  deliverBy?: DeliverBy;
  creditDaysWanted?: number;
}

export const SANDBOX_SAMPLES: readonly SandboxSample[] = [
  {
    // The docs/DEMO.md line. The steel tier is left unsaid so the sandbox asks it, as the demo does;
    // "लोकल ISI" makes it the TEAM_TEST order, which the personas answer with the card numbers.
    id: "demo",
    text: {
      hi: "कल सुबह तक 2 टन 12mm सरिया Fe500D और 150 बोरी PPC, 15 दिन उधार",
      en: "2 ton 12mm sariya Fe500D and 150 bags PPC by tomorrow morning, 15 days credit",
    },
    items: [
      { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", quantity: 2, unit: "ton" },
      { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
    ],
    deliverBy: "tomorrow_morning",
    creditDaysWanted: 15,
  },
  {
    id: "cement",
    text: { hi: "परसों तक 300 बोरी OPC 53 सीमेंट, नामी कंपनी का", en: "300 bags OPC 53 cement, a known brand, by the day after tomorrow" },
    items: [{ id: "cement", material: "cement", cementType: "OPC53", tier: "branded", quantity: 300, unit: "bag" }],
    deliverBy: "day_after",
  },
  {
    id: "steel",
    text: { hi: "आज 1 टन 8mm और 1 टन 16mm सरिया Fe500D, लोकल ISI, नकद", en: "1 ton 8mm and 1 ton 16mm sariya Fe500D, local ISI, today, cash" },
    items: [
      { id: "steel", material: "tmt_steel", diameterMm: 8, grade: "Fe500D", tier: "local_isi", quantity: 1, unit: "ton" },
      { id: "steel_2", material: "tmt_steel", diameterMm: 16, grade: "Fe500D", tier: "local_isi", quantity: 1, unit: "ton" },
    ],
    deliverBy: "today",
    creditDaysWanted: 0,
  },
];

export function sandboxSample(id: string): SandboxSample | undefined {
  return SANDBOX_SAMPLES.find((s) => s.id === id);
}
