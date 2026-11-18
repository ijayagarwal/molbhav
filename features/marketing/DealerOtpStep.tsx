"use client";

// /dealer's SMS OTP step (DECISIONS R24), loaded with React.lazy by DealerForm once the application is saved;
// this module and firebaseOtp.ts (the Firebase SDK) form their own chunk. The dealer taps "कोड भेजिए" (invisible
// reCAPTCHA, then Firebase sends the SMS), types the six digits, and the Firebase ID token goes to the
// verifyDealerPhone server action, which checks it on the server and records the verification. Skipping, or
// any failure, ends like the form without OTP: the founders verify by calling back. Nothing is stored in the
// browser.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { CheckBold } from "@/components/mb/icons";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { verifyDealerPhone } from "./actions";
import { createOtpSession, type OtpSession } from "./firebaseOtp";
import { Field, FormAlert, FormDone, inputClass } from "./FormParts";
import { cleanOtp, OTP_ERROR_KEY, OtpError, type FirebaseWebConfig } from "./otp";

type Phase = "ready" | "sending" | "sent" | "checking" | "verified" | "unverified" | "skipped";

/** "+91 98290 12345": the dealer's own number, on the dealer's own phone. */
const spaced = (e164: string) => `${e164.slice(0, 3)} ${e164.slice(3, 8)} ${e164.slice(8)}`;

export default function DealerOtpStep({ applicationId, phoneE164, config }: { applicationId: string; phoneE164: string; config: FirebaseWebConfig }) {
  const { t, lang } = useT();
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const session = useRef<OtpSession | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [code, setCode] = useState("");
  const [error, setError] = useState<DictKey | null>(null);

  useEffect(() => () => session.current?.dispose(), []);
  useEffect(() => {
    if (error !== null) alertRef.current?.focus();
    else if (phase === "sent") codeRef.current?.focus();
  }, [error, phase]);

  const otp = (): OtpSession => {
    if (session.current === null) {
      if (recaptchaRef.current === null) throw new OtpError("failed");
      session.current = createOtpSession(config, recaptchaRef.current, lang);
    }
    return session.current;
  };

  const send = async () => {
    setError(null);
    setPhase("sending");
    try {
      await otp().send(phoneE164);
      setCode("");
      setPhase("sent");
    } catch (e) {
      setError(OTP_ERROR_KEY[e instanceof OtpError ? e.code : "failed"]);
      setPhase("ready");
    }
  };

  const confirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase === "checking") return;
    const digits = cleanOtp(code);
    if (digits === null) {
      setError("dealer.otpErrDigits");
      return;
    }
    setError(null);
    setPhase("checking");
    let idToken: string;
    try {
      idToken = await otp().confirm(digits);
    } catch (err) {
      const c = err instanceof OtpError ? err.code : "failed";
      setError(OTP_ERROR_KEY[c]);
      setPhase(c === "bad_code" ? "sent" : "ready");
      return;
    }
    const answer = await verifyDealerPhone({ applicationId, phone: phoneE164, idToken }).catch(() => ({ ok: false as const, code: "server" as const }));
    setPhase(answer.ok ? "verified" : "unverified");
  };

  if (phase === "verified") return <FormDone title={t("dealer.verifiedTitle")} body={t("dealer.done")} />;
  if (phase === "skipped" || phase === "unverified") {
    return (
      <div className="flex flex-col gap-3">
        {phase === "unverified" ? <p className="text-label text-ink-2">{t("dealer.otpErrVerify")}</p> : null}
        <FormDone title={t("dealer.doneTitle")} body={t("dealer.done")} />
      </div>
    );
  }

  const sent = phase === "sent" || phase === "checking";
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="flex items-center gap-2 text-label text-hara">
        <CheckBold aria-hidden="true" className="size-5 shrink-0" />
        {t("dealer.otpSaved")}
      </p>
      <h3 className="font-display text-title-2">{t("dealer.otpTitle")}</h3>
      <p className="text-body text-ink">{sent ? t("dealer.otpSent", { phone: spaced(phoneE164) }) : t("dealer.otpBody", { phone: spaced(phoneE164) })}</p>

      {sent ? (
        <form onSubmit={confirm} noValidate className="flex flex-col gap-4">
          <Field id="dealer-otp-code" label={t("dealer.otpCode")} error={null}>
            <input
              ref={codeRef}
              id="dealer-otp-code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              aria-invalid={error === "dealer.otpErrDigits" || error === "dealer.otpErrCode" || undefined}
              className={`${inputClass} font-mono tracking-[0.3em]`}
            />
          </Field>
          {error !== null ? <FormAlert ref={alertRef} message={t(error)} /> : null}
          <PrimaryButton type="submit" disabled={phase === "checking"} aria-busy={phase === "checking"}>
            {phase === "checking" ? t("dealer.otpChecking") : t("dealer.otpConfirm")}
          </PrimaryButton>
          <SecondaryButton onClick={send} disabled={phase === "checking"}>
            {t("dealer.otpResend")}
          </SecondaryButton>
        </form>
      ) : (
        <>
          {error !== null ? <FormAlert ref={alertRef} message={t(error)} /> : null}
          <PrimaryButton onClick={send} disabled={phase === "sending"} aria-busy={phase === "sending"}>
            {phase === "sending" ? t("dealer.otpSending") : t("dealer.otpSend")}
          </PrimaryButton>
        </>
      )}

      <button
        type="button"
        onClick={() => setPhase("skipped")}
        disabled={phase === "checking"}
        className="inline-flex min-h-14 w-fit items-center text-label text-neel underline underline-offset-4 disabled:text-ink-3"
      >
        {t("dealer.otpSkip")}
      </button>
      {/* Invisible reCAPTCHA (Firebase) renders here. */}
      <div ref={recaptchaRef} />
    </div>
  );
}
