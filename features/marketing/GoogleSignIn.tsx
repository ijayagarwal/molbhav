"use client";

// "Google से जुड़िए" on /dealer (DECISIONS R25): free sign-in instead of paid SMS, on only when the site has a
// GOOGLE_CLIENT_ID. Google's own popup (Google Identity Services, token flow, scope "openid email") gives an
// access token; it goes to the server in a hidden field, and the server asks Google whether it was issued to our
// client (lib/server/googleToken.ts). Our own 56 px button, not Google's 40 px one (tap targets, DESIGN.md). Google's
// script loads only on /dealer, only when this is on. Nothing is stored in the browser.
import Image from "next/image";
import Script from "next/script";
import { useRef, useState } from "react";
import { SecondaryButton } from "@/components/mb/Buttons";
import { CheckBold } from "@/components/mb/icons";
import { useT } from "@/lib/i18n/useT";

interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string }) => void;
  }): TokenClient;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

/** Google's "G" mark, as Google's sign-in branding asks for: a third-party image asset, not our palette (DESIGN.md). */
function GoogleMark() {
  return <Image src="/brand/google-g.svg" alt="" width={20} height={20} unoptimized className="size-5 shrink-0" />;
}

export function GoogleSignIn({ clientId, invalid, errorId }: { clientId: string; invalid: boolean; errorId: string }) {
  const { t } = useT();
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const client = useRef<TokenClient | null>(null);

  const start = () => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (oauth2 === undefined) {
      setState("error");
      return;
    }
    client.current ??= oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email",
      callback: (r) => {
        if (r.error !== undefined || typeof r.access_token !== "string") {
          setState("error");
          return;
        }
        const accessToken = r.access_token;
        setToken(accessToken);
        setState("done");
        // Only to show which account: the server checks the token itself.
        fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } })
          .then(async (res) => (res.ok ? ((await res.json()) as { email?: unknown }) : {}))
          .then((info) => setEmail(typeof info.email === "string" ? info.email : null))
          .catch(() => setEmail(null));
      },
      // The dealer closed the popup: back to the button, no error.
      error_callback: () => setState((s) => (s === "waiting" ? "idle" : s)),
    });
    setState("waiting");
    client.current.requestAccessToken();
  };

  const reset = () => {
    setToken(null);
    setEmail(null);
    setState("idle");
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={invalid ? errorId : undefined}>
      <Script src={GSI_SRC} strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setState("error")} />
      <legend className="mb-1.5 text-label">{t("dealer.googleTitle")}</legend>
      <p className="text-meta text-ink-2">{t("dealer.googleNotice")}</p>
      {state === "done" && token !== null ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p role="status" className="flex min-w-0 items-center gap-2 break-all text-label text-hara">
            <CheckBold aria-hidden="true" className="size-5 shrink-0" />
            {email === null ? t("dealer.googleDone") : t("dealer.googleDoneAs", { email })}
          </p>
          <button type="button" onClick={reset} className="inline-flex min-h-14 items-center text-label text-neel underline underline-offset-4">
            {t("dealer.googleChange")}
          </button>
          <input type="hidden" name="googleToken" value={token} />
        </div>
      ) : (
        <SecondaryButton
          onClick={start}
          disabled={!loaded || state === "waiting"}
          aria-busy={state === "waiting"}
          aria-invalid={invalid || undefined}
          data-field="google"
          icon={<GoogleMark />}
          className="w-full sm:w-fit"
        >
          {state === "waiting" ? t("dealer.googleWaiting") : t("dealer.googleButton")}
        </SecondaryButton>
      )}
      {state === "error" ? (
        <p role="status" className="text-label text-ink-2">
          {t("dealer.googleErr")}
        </p>
      ) : null}
      {invalid ? (
        <p id={errorId} className="text-label text-lal">
          {t("dealer.googleRequired")}
        </p>
      ) : null}
    </fieldset>
  );
}
