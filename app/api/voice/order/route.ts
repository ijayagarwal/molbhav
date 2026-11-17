import { handleVoiceOrder } from "@/lib/server/voiceOrder";
import { voiceOrderDeps } from "@/lib/server/voiceDeps";

// The voice order fast path (ARCHITECTURE §6.1, DECISIONS F3): BotID, auth, limits, Sarvam STT (streamed to
// the client first), the OpenAI parse, then orders.createDraft as the user. NDJSON contract in
// lib/server/voiceOrder.ts. Runs in Mumbai: vercel.json pins every function to bom1 (the route-level
// `preferredRegion` export is deprecated in Next.js 16.4 and not used).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  return await handleVoiceOrder(req, voiceOrderDeps());
}
