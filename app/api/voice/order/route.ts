import { handleVoiceOrder } from "@/lib/server/voiceOrder";
import { voiceOrderDeps } from "@/lib/server/voiceDeps";

// The voice order fast path (ARCHITECTURE §6.1, DECISIONS F3): BotID, auth, limits, Sarvam STT (streamed to
// the client first), the OpenAI parse, then orders.createDraft as the user. NDJSON contract in
// lib/server/voiceOrder.ts. Runs in Mumbai: vercel.json pins every function to bom1 (the route-level
// `preferredRegion` export is deprecated in Next.js 16.4 and not used).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  // /try sends ?sandbox=1 (G3, ARCHITECTURE §6.9): sandbox limits and a sandbox draft (sim only, 24 h).
  const sandbox = new URL(req.url).searchParams.get("sandbox") === "1";
  return await handleVoiceOrder(req, voiceOrderDeps(), { sandbox });
}
