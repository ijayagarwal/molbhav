import { handleTts } from "@/lib/server/readbackAudio";
import { ttsDeps } from "@/lib/server/voiceDeps";

// The read-back on Confirm (ARCHITECTURE §6.1 step 8, DECISIONS V3): { draftId } only; the text is built on
// the server from the caller's own draft and spoken by Bulbul v4 Flash. Contract in lib/server/readbackAudio.ts.
// Runs in Mumbai: vercel.json pins every function to bom1.
export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request): Promise<Response> {
  return await handleTts(req, ttsDeps());
}
