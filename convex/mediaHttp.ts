// GET /rec/<callId>?t=<token> (DECISIONS B6, ARCHITECTURE §6.11): streams one stored call recording.
// The token (lib/recToken.ts, issued by media.recToken) is the only key: HMAC-checked in constant time,
// 10 minutes, one call. Range requests get 206 so the browser can seek (Safari needs it). Nothing about the
// dealer is in the reply: no file name, no ids beyond the call id already in the URL, and no caching.
import { parseRange } from "../lib/recording";
import { recTokenSecret, verifyRecToken } from "../lib/recToken";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

export const REC_PATH_PREFIX = "/rec/";

/** Headers on every reply: never cached or sniffed, no referrer, and nothing that names anyone. */
const COMMON: Record<string, string> = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const plain = (status: number, body: string) => new Response(body, { status, headers: { ...COMMON, "Content-Type": "text/plain; charset=utf-8" } });

export const serveRecording = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const callId = url.pathname.startsWith(REC_PATH_PREFIX) ? url.pathname.slice(REC_PATH_PREFIX.length) : "";
  const secret = recTokenSecret(process.env.REC_TOKEN_SECRET);
  if (secret === null) return plain(503, "not_configured");
  const check = await verifyRecToken(secret, callId, url.searchParams.get("t"), Date.now());
  if (check !== "ok") {
    console.log(JSON.stringify({ evt: "rec_refused", reason: check }));
    return plain(403, "forbidden");
  }
  const rec = await ctx.runQuery(internal.media.servable, { callId });
  const blob = rec === null ? null : await ctx.storage.get(rec.storageId);
  if (rec === null || blob === null) return plain(404, "not_found");

  const size = blob.size;
  const range = parseRange(req.headers.get("range"), size);
  const audio = { ...COMMON, "Content-Type": rec.contentType, "Content-Disposition": "inline", "Accept-Ranges": "bytes" };
  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...COMMON, "Accept-Ranges": "bytes", "Content-Range": `bytes */${size}` } });
  }
  if (range.kind === "full") return new Response(blob, { status: 200, headers: { ...audio, "Content-Length": String(size) } });
  const part = blob.slice(range.start, range.end + 1);
  return new Response(part, {
    status: 206,
    headers: { ...audio, "Content-Length": String(part.size), "Content-Range": `bytes ${range.start}-${range.end}/${size}` },
  });
});
