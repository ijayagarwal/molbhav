// The one HTTP client for Bolna (ARCHITECTURE §7 Bolna), shared by convex/bolna.ts and the bolna:* scripts.
// Plain fetch, isomorphic. The key is sent only as the Authorization header and never appears in an
// error, a log line or a return value.
//
// Every caller names the endpoints it may touch (`allow`). The scripts get SCRIPT_ENDPOINTS, which
// cannot dial (no /call, no /batches); only convex/bolna.ts gets DIAL_ENDPOINTS, and it calls POST /call
// only after internal.calls.claimDial said ok (CLAUDE.md hard rule 2). Anything outside the list throws
// before a request is made.

export const BOLNA_BASE_URL = "https://api.bolna.ai";

export type Endpoint =
  /** GET /user/me: wallet and concurrency. */
  | "user.me"
  /** GET /v2/agent/all */
  | "agent.list"
  /** GET /v2/agent/{id} */
  | "agent.get"
  /** POST /v2/agent */
  | "agent.create"
  /** PUT /v2/agent/{id} */
  | "agent.update"
  /** GET /api/v1/voice-config/tts?language= and …/voices */
  | "voice.providers"
  | "voice.list"
  /** GET /executions/{id} */
  | "execution.get"
  /** GET /v2/agent/{id}/executions */
  | "execution.list"
  /** POST /call: places a real phone call. convex/bolna.ts only, after claimDial's ok. */
  | "call.make"
  /** POST /call/{id}/stop: stops a queued or scheduled call (Bolna can't stop one in progress). */
  | "call.stop"
  /** POST /web-call/session: a 2-minute single-use browser session (admin web-call page). */
  | "webcall.session";

/** What the bolna:check and bolna:sync scripts may do: read, and create or update agents. Never dial. */
export const SCRIPT_ENDPOINTS: readonly Endpoint[] = ["user.me", "agent.list", "agent.get", "agent.create", "agent.update", "voice.providers", "voice.list"];
/** What the Convex side may do. */
export const DIAL_ENDPOINTS: readonly Endpoint[] = ["execution.get", "execution.list", "call.make", "call.stop", "webcall.session"];

export class BolnaError extends Error {
  constructor(
    readonly code: "not_configured" | "not_allowed" | "timeout" | "network" | "http" | "bad_response",
    readonly status?: number,
    /** Bolna's own message, trimmed; never contains our key. */
    readonly detail?: string,
  ) {
    super(status === undefined ? `bolna_${code}` : `bolna_${code}_${status}`);
    this.name = "BolnaError";
  }
}

export interface BolnaClientOptions {
  apiKey: string | undefined;
  allow: readonly Endpoint[];
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const UUIDISH = /^[A-Za-z0-9-]{8,64}$/;

function pathId(id: string): string {
  if (!UUIDISH.test(id)) throw new BolnaError("bad_response", undefined, "bad id");
  return encodeURIComponent(id);
}

export interface ListExecutionsQuery {
  /** ISO 8601 UTC; Bolna needs both and at most 7 days apart. */
  from: string;
  to: string;
  pageSize?: number;
  pageNumber?: number;
}

export function createBolnaClient(opts: BolnaClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl ?? BOLNA_BASE_URL;
  const key = opts.apiKey?.trim() ?? "";

  async function request(endpoint: Endpoint, method: "GET" | "POST" | "PUT", path: string, body?: unknown, timeoutMs = 10_000): Promise<unknown> {
    if (!opts.allow.includes(endpoint)) throw new BolnaError("not_allowed", undefined, endpoint);
    if (key === "") throw new BolnaError("not_configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      throw new BolnaError(controller.signal.aborted ? "timeout" : "network", undefined, e instanceof Error ? e.name : undefined);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new BolnaError("http", res.status, text.replaceAll(key, "[key]").slice(0, 300));
    if (text === "") return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BolnaError("bad_response", res.status);
    }
  }

  return {
    userMe: async () => request("user.me", "GET", "/user/me"),
    listAgents: async () => request("agent.list", "GET", "/v2/agent/all"),
    getAgent: async (agentId: string) => request("agent.get", "GET", `/v2/agent/${pathId(agentId)}`),
    createAgent: async (body: unknown) => request("agent.create", "POST", "/v2/agent", body, 30_000),
    updateAgent: async (agentId: string, body: unknown) => request("agent.update", "PUT", `/v2/agent/${pathId(agentId)}`, body, 30_000),
    ttsProviders: async (language: string) => request("voice.providers", "GET", `/api/v1/voice-config/tts?language=${encodeURIComponent(language)}`),
    ttsVoices: async (q: { providerId: string; modelId: string; language: string; page?: number }) =>
      request(
        "voice.list",
        "GET",
        `/api/v1/voice-config/tts/voices?provider_id=${pathId(q.providerId)}&model_id=${pathId(q.modelId)}&language=${encodeURIComponent(q.language)}&page=${q.page ?? 1}&page_size=100`,
      ),
    getExecution: async (executionId: string) => request("execution.get", "GET", `/executions/${pathId(executionId)}`),
    listAgentExecutions: async (agentId: string, q: ListExecutionsQuery) =>
      request(
        "execution.list",
        "GET",
        `/v2/agent/${pathId(agentId)}/executions?from=${encodeURIComponent(q.from)}&to=${encodeURIComponent(q.to)}&page_size=${q.pageSize ?? 50}&page_number=${q.pageNumber ?? 1}`,
      ),
    /** POST /call. The body is built by convex/bolna.ts after claimDial; retries and rescheduling stay off (R2). */
    makeCall: async (body: MakeCallBody) => request("call.make", "POST", "/call", body, MAKE_CALL_TIMEOUT_MS),
    stopCall: async (executionId: string) => request("call.stop", "POST", `/call/${pathId(executionId)}/stop`),
    mintWebCallSession: async (body: { agent_id: string; user_data: Record<string, string> }) => request("webcall.session", "POST", "/web-call/session", body),
  };
}

export type BolnaClient = ReturnType<typeof createBolnaClient>;

/** Well under the 30 s dialing deadline, so the watchdog never races a POST still in flight (R15). */
export const MAKE_CALL_TIMEOUT_MS = 10_000;

export interface MakeCallBody {
  agent_id: string;
  recipient_phone_number: string;
  /** Omitted on the trial (Bolna's own caller ID, B9). */
  from_phone_number?: string;
  user_data: Record<string, string>;
  /** Always present and off: every retry is our own new call through claimDial (R2). */
  retry_config: { enabled: false };
}

/** Whether a failed POST /call certainly placed no call (a definite refusal), so the call can be closed as failed. */
export function dialDefinitelyRefused(e: unknown): boolean {
  // Bolna answers 4xx before queuing anything (bad agent, bad number, a from number still activating → 429).
  return e instanceof BolnaError && (e.code === "not_configured" || e.code === "not_allowed" || (e.code === "http" && e.status !== undefined && e.status >= 400 && e.status < 500 && e.status !== 408));
}
