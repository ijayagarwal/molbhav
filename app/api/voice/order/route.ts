import { handleVoiceOrder } from "@/lib/server/voiceOrder";
import { voiceOrderDeps } from "@/lib/server/voiceDeps";

// The voice order fast path (ARCHITECTURE §6.1, DECISIONS F3): BotID, auth, limits, Sarvam STT (streamed to
// the client first), the Gemini parse, then orders.createDraft as the user. NDJSON contract in
// lib/server/voiceOrder.ts. Pinned to Mumbai, next to the contractors and Sarvam.
export const runtime = "nodejs";
export const preferredRegion = "bom1";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  return await handleVoiceOrder(req, voiceOrderDeps());
}
