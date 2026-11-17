"use client";

// /app/admin/agents (Phase 8B): a founder talks to one of the four Bolna agents in the browser, playing the
// dealer, with the Team test demo order (CALL_SCRIPT "Testing ladder" step 2). No phone call is placed.
// - A call starts ONLY from a tap on "बात शुरू कीजिए"; nothing here starts one on load or on a timer.
// - The browser never sees BOLNA_API_KEY: it asks our Convex site for a 2-minute, single-use session
//   (POST /bolna/web-call-session, admin-checked on the server, convex/bolnaHttp.ts), the pattern Bolna
//   documents for its Web Call SDK (https://www.bolna.ai/docs/developer-resources/sdks/web-call).
// - The SDK (@bolna/web-call) is loaded at runtime on this page only, pinned and integrity-checked
//   (features/admin/webCallSdk.ts), so no app bundle carries it.
import { useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { api } from "@/convex/_generated/api";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { loadWebCallSdk, type BolnaWebCallCtor } from "./webCallSdk";

type Agent = "quote" | "haggle" | "match" | "confirm";
const AGENTS: readonly Agent[] = ["quote", "haggle", "match", "confirm"];
const AGENT_KEY: Record<Agent, DictKey> = { quote: "agents.quote", haggle: "agents.haggle", match: "agents.match", confirm: "agents.confirm" };

type Call = InstanceType<BolnaWebCallCtor>;
type State = "idle" | "connecting" | "ringing" | "active" | "ended";
const STATE_KEY: Record<State, DictKey> = {
  idle: "agents.stateIdle",
  connecting: "agents.stateConnecting",
  ringing: "agents.stateRinging",
  active: "agents.stateActive",
  ended: "agents.stateEnded",
};

/** https://<deployment>.convex.site, from the public Convex URL (…convex.cloud). */
function convexSiteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? url.replace(/\.convex\.cloud\/?$/, ".convex.site") : null;
}

function errorKey(code: string | undefined): DictKey {
  if (code === "mint_failed" || code === "call_rejected") return "agents.errMint";
  if (code === "microphone_denied") return "agents.errMic";
  if (code === "at_capacity") return "agents.errCapacity";
  return "agents.errOther";
}

function Panel() {
  const { t } = useT();
  const token = useAuthToken();
  const status = useQuery(api.admin.agentsStatus, {});
  const sdk = useRef<BolnaWebCallCtor | null>(null);
  const call = useRef<Call | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [active, setActive] = useState<Agent | null>(null);
  const [state, setState] = useState<State>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<DictKey | null>(null);

  // Load the SDK ahead of the tap, so start() runs inside the click (browsers block audio otherwise).
  useEffect(() => {
    let alive = true;
    loadWebCallSdk().then(
      (ctor) => {
        if (!alive) return;
        sdk.current = ctor;
        setSdkReady(true);
      },
      () => {
        if (alive) setError("agents.errOther");
      },
    );
    return () => {
      alive = false;
      void call.current?.stop();
    };
  }, []);

  if (status === undefined) return <p className="text-body text-ink-2">{t("admin.loading")}</p>;

  const site = convexSiteUrl();
  const busy = active !== null && state !== "ended" && state !== "idle";

  // The only place a web call starts: the founder's tap.
  const start = (agent: Agent) => {
    if (sdk.current === null || site === null || token === null || busy) return;
    setError(null);
    setMuted(false);
    setActive(agent);
    setState("connecting");
    const c = new sdk.current({
      getSession: async () => {
        const res = await fetch(`${site}/bolna/web-call-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ agent }),
        });
        if (!res.ok) throw new Error(`session ${res.status}`);
        return await res.json();
      },
    });
    c.on("state-change", (s) => setState(s));
    c.on("call-end", () => setState("ended"));
    c.on("error", (e) => setError(errorKey(e.code)));
    call.current = c;
    c.start().catch(() => setState("ended"));
  };

  const stop = () => {
    void call.current?.stop();
    setState("ended");
  };

  const toggleMute = () => {
    if (call.current === null) return;
    const next = !muted;
    call.current.setMuted(next);
    setMuted(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-2">{t("agents.intro")}</p>
      <p className="text-meta text-ink-2">{t("agents.demoOrder")}</p>
      {active === null && error !== null ? (
        <p role="alert" className="text-label text-lal">
          {t(error)}
        </p>
      ) : null}
      {status.apiKeySet ? null : (
        <p role="alert" className="text-label text-lal">
          {t("agents.keyMissing")}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {AGENTS.map((agent) => {
          const configured = status.agents[agent] && status.apiKeySet;
          const mine = active === agent;
          const live = mine && busy;
          return (
            <section key={agent} className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
              <h2 className="font-display text-title-2">{t(AGENT_KEY[agent])}</h2>
              {configured ? null : <p className="text-meta text-ink-2">{t("agents.notConfigured")}</p>}
              {mine ? (
                <p className="text-label text-ink" aria-live="polite">
                  {t(STATE_KEY[state])}
                </p>
              ) : null}
              {mine && error !== null ? (
                <p role="alert" className="text-meta text-lal">
                  {t(error)}
                </p>
              ) : null}
              {live ? (
                <div className="flex flex-wrap gap-3">
                  <SecondaryButton tone="lal" onClick={stop}>
                    {t("agents.stop")}
                  </SecondaryButton>
                  <SecondaryButton onClick={toggleMute} aria-pressed={muted}>
                    {t(muted ? "agents.unmute" : "agents.mute")}
                  </SecondaryButton>
                </div>
              ) : (
                <PrimaryButton size="md" disabled={!configured || !sdkReady || site === null || token === null || busy} onClick={() => start(agent)}>
                  {t("agents.start")}
                </PrimaryButton>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function AgentsPanel() {
  const { t } = useT();
  const { isLoading } = useConvexAuth();
  const isAdmin = useQuery(api.admin.amIAdmin, isLoading ? "skip" : {});
  return (
    <main className="mx-auto flex max-w-[1040px] flex-col gap-4 px-4 py-8 sm:px-5 lg:px-8">
      <Link href="/app/admin" className="inline-flex min-h-14 w-fit items-center text-label text-neel">
        {t("agents.back")}
      </Link>
      <h1 className="font-display text-title-1">{t("agents.title")}</h1>
      {isAdmin === undefined ? (
        <p className="text-body text-ink-2">{t("admin.loading")}</p>
      ) : isAdmin ? (
        <Panel />
      ) : (
        <p role="alert" className="text-body text-ink-2">
          {t("admin.notAllowed")}
        </p>
      )}
    </main>
  );
}
