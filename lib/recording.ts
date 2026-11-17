// Call recordings (DECISIONS B6, ARCHITECTURE §6.11): what media.copyRecording downloads from Bolna's
// presigned link and what the /rec route serves. Pure, fetch injected. The link is untrusted input, so:
// https only and no IP literals or local hosts; at most MAX_RECORDING_BYTES, read as a stream and cut off
// past the limit; the stored type comes from the file's own first bytes (an HTML error page is never kept),
// never from the server's header; and every failure says whether a retry can help.

/** A call is at most a few minutes; 16 MiB holds about 17 minutes of 128 kbps MP3 and keeps every /rec reply under Convex's 20 MB. */
export const MAX_RECORDING_BYTES = 16 * 1024 * 1024;
/** Smaller than this is not a call recording. */
export const MIN_RECORDING_BYTES = 512;
export const DOWNLOAD_TIMEOUT_MS = 60_000;

/** The audio types we store and serve (sniffed, never taken from a header). */
export type AudioType = "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/mp4" | "audio/webm";
export const AUDIO_TYPES: readonly AudioType[] = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"];

const ascii = (b: Uint8Array, at: number, s: string) => s.split("").every((c, i) => b[at + i] === c.charCodeAt(0));

/** The audio container of a file from its first bytes, or null when it isn't one we keep. */
export function sniffAudioType(b: Uint8Array): AudioType | null {
  if (b.length < 12) return null;
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) return "audio/wav";
  if (ascii(b, 0, "ID3")) return "audio/mpeg";
  // An MPEG audio frame: 11 sync bits, then a layer that isn't "reserved" (00).
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) return "audio/mpeg";
  if (ascii(b, 0, "OggS")) return "audio/ogg";
  if (ascii(b, 4, "ftyp")) return "audio/mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  return null;
}

/** Whether a link may be fetched: https, a DNS name (no IP literal, no local or internal host), no credentials. */
export function isFetchableRecordingUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  if (host === "" || host.startsWith("[") || /^[\d.]+$/.test(host) || !host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return true;
}

/** Content-Type headers a recording may arrive with (S3 often says octet-stream); anything else (HTML, JSON) is refused. */
function acceptableHeaderType(header: string | null): boolean {
  if (header === null || header.trim() === "") return true;
  const t = header.split(";")[0].trim().toLowerCase();
  return t.startsWith("audio/") || t === "video/mp4" || t === "video/webm" || t === "application/octet-stream" || t === "binary/octet-stream";
}

export type DownloadResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; contentType: AudioType }
  /** `retry`: a later attempt (with a freshly fetched link) may work. */
  | { ok: false; retry: boolean; reason: string };

const fail = (retry: boolean, reason: string): DownloadResult => ({ ok: false, retry, reason });

/**
 * Downloads one recording. Redirects are followed (the link is a presigned redirect). No auth header is
 * ever sent: our Bolna key must not reach the storage host.
 */
export async function downloadRecording(
  url: string,
  opts: { fetchImpl?: typeof fetch; maxBytes?: number; timeoutMs?: number } = {},
): Promise<DownloadResult> {
  if (!isFetchableRecordingUrl(url)) return fail(false, "bad_url");
  const maxBytes = opts.maxBytes ?? MAX_RECORDING_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await (opts.fetchImpl ?? fetch)(url, { method: "GET", redirect: "follow", signal: controller.signal });
    } catch {
      return fail(true, controller.signal.aborted ? "timeout" : "network");
    }
    if (res.url && !res.url.startsWith("https://")) return fail(false, "redirect_not_https");
    if (!res.ok) {
      // 403/410: the presigned link expired; the next attempt re-fetches the execution for a fresh one.
      const retry = res.status === 403 || res.status === 408 || res.status === 410 || res.status === 429 || res.status >= 500;
      await res.body?.cancel().catch(() => {});
      return fail(retry, `http_${res.status}`);
    }
    if (!acceptableHeaderType(res.headers.get("content-type"))) {
      await res.body?.cancel().catch(() => {});
      return fail(false, "not_audio");
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel().catch(() => {});
      return fail(false, "too_large");
    }
    if (res.body === null) return fail(true, "empty");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          return fail(false, "too_large");
        }
        chunks.push(value);
      }
    } catch {
      return fail(true, controller.signal.aborted ? "timeout" : "network");
    }
    if (total < MIN_RECORDING_BYTES) return fail(false, "too_small");
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    const contentType = sniffAudioType(bytes);
    if (contentType === null) return fail(false, "not_audio");
    return { ok: true, bytes, contentType };
  } finally {
    clearTimeout(timer);
  }
}

export type ByteRange = { kind: "full" } | { kind: "partial"; start: number; end: number } | { kind: "unsatisfiable" };

/**
 * One `Range: bytes=…` header against a file of `size` bytes (RFC 9110 §14). A missing, malformed or
 * multi-range header gets the whole file (a server may ignore Range); `bytes=a-b`, `bytes=a-` and the
 * suffix form `bytes=-n` give a partial reply; a start past the end is unsatisfiable (416).
 */
export function parseRange(header: string | null, size: number): ByteRange {
  if (header === null) return { kind: "full" };
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (m === null) return { kind: "full" };
  const [, a, b] = m;
  if (a === "" && b === "") return { kind: "full" };
  if (a === "") {
    const n = Number(b);
    if (n === 0) return { kind: "unsatisfiable" };
    if (size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isSafeInteger(start) || start >= size) return { kind: "unsatisfiable" };
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (!Number.isSafeInteger(end) || end < start) return { kind: "full" };
  return { kind: "partial", start, end };
}
