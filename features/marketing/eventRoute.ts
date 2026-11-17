// POST /api/e (G6, ARCHITECTURE §6.13): the browser's analytics beacon. Body `{ name, props?, path }` (JSON,
// sent as text/plain by navigator.sendBeacon). Same-origin only, at most 1 KB, checked against the allow-list
// here and again in events.track, which also rate-limits by the IP hash. Answers: 204 stored, 400 refused,
// 403 cross-origin, 413 too big, 429 rate-limited, 503 not configured.
import type { TrackResult } from "@/convex/events";
import { isEventName, normaliseEventPath, validateEventProps } from "@/lib/analytics";

export interface EventRouteDeps {
  ipHash: (req: Request) => string | null;
  secret: () => string | null;
  track: (args: { serverSecret: string; ipHash: string; name: string; props?: Record<string, string>; path: string }) => Promise<TrackResult>;
  log: (entry: Record<string, unknown>) => void;
}

const MAX_BODY = 1024;
const empty = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function handleEvent(req: Request, deps: EventRouteDeps): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin !== null) {
    let sameOrigin = false;
    try {
      const from = new URL(origin).host;
      sameOrigin = from === req.headers.get("x-forwarded-host") || from === req.headers.get("host");
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return empty(403);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return empty(413);
  const text = await req.text();
  if (text.length > MAX_BODY) return empty(413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return empty(400);
  }
  if (typeof body !== "object" || body === null) return empty(400);
  const { name, props, path } = body as { name?: unknown; props?: unknown; path?: unknown };
  if (!isEventName(name)) return empty(400);
  const cleanProps = validateEventProps(name, props);
  const cleanPath = normaliseEventPath(path);
  if (cleanProps === null || cleanPath === null) return empty(400);

  const secret = deps.secret();
  const ipHash = deps.ipHash(req);
  if (secret === null || ipHash === null) {
    deps.log({ at: "api/e", code: "not_configured" });
    return empty(503);
  }
  try {
    const r = await deps.track({ serverSecret: secret, ipHash, name, props: cleanProps ? (JSON.parse(cleanProps) as Record<string, string>) : undefined, path: cleanPath });
    if (r.ok) return empty(204);
    return empty(r.code === "rate_limited" ? 429 : 400);
  } catch {
    deps.log({ at: "api/e", name, code: "error" });
    return empty(503);
  }
}
