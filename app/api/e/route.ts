import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { handleEvent } from "@/features/marketing/eventRoute";
import { ipHashOf, log, serverSecret } from "@/features/marketing/server";

// The analytics beacon (G6, ARCHITECTURE §6.13): allow-listed events only, rate-limited by the IP hash inside
// events.track. Contract in features/marketing/eventRoute.ts. Runs in Mumbai (vercel.json pins bom1).
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  return await handleEvent(req, {
    ipHash: (r) => ipHashOf(r.headers),
    secret: serverSecret,
    track: async (args) => await fetchMutation(api.events.track, args),
    log,
  });
}
