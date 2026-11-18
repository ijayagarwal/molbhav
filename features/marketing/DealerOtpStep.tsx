"use client";

// /dealer's number check (DECISIONS R24, R25), shown once the application is saved. The dealer taps "कोड भेजिए",
// Bolna texts a 6-digit code to the number on the application, the dealer types it, and Bolna checks it: the
// number is proved to be theirs and goes on Bolna's trial list, so test calls can reach it. No SMS service of
// our own, no third-party script on the page. Skipping, or any failure we can't fix here, ends like the form
// without the check: the founders call back. Nothing is stored in the browser.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { CheckBold } from "@/components/mb/icons";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { checkDealerOtp, sendDealerOtp } from "./actions";
import { Field, FormAlert, FormDone, inputClass } from "./FormParts";
import { cleanOtp, OTP_PROBLEM, type OtpAnswer } from "./otp";

type Phase = "ready" | "sending" | "sent" | "checking" | "verified" | "fallback" | "skipped";

/** "+91 98290 12345": the dealer's own number, on the dealer's own phone. */
const spaced = (e164: string) => `${e164.slice(0, 3)} ${e164.slice(3, 8)} ${e164.slice(8)}`;

const FAILED: OtpAnswer = { ok: false, code: "failed" };

export default function DealerOtpStep({ applicationId, ticket, phoneE164 }: { applicationId: string; ticket: string; phoneE164: string }) {
  const { t } = useT();
  const codeRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [code, setCode] = useState("");
  const [error, setError] = useState<DictKey | null>(null);

  useEffect(() => {
    if (error !== null) alertRef.current?.focus();
    else if (phase === "sent") codeRef.current?.focus();
  }, [error, phase]);

  /** Shows a refusal and moves the step on (stay, ask for a new code, or the call-back ending). */
  const refuse = (answer: Extract<OtpAnswer, { ok: false }>, here: Phase) => {
    const problem = OTP_PROBLEM[answer.code];
    if (problem.next === "fallback") {
      setPhase("fallback");
      return;
    }
    setError(problem.key);
    setPhase(problem.next === "resend" ? "ready" : here);
  };

  const send = async () => {
    if (phase === "sending" || phase === "checking") return;
    const was = phase;
    setError(null);
    setPhase("sending");
    const answer = await sendDealerOtp({ applicationId, ticket }).catch(() => FAILED);
    if (answer.ok) {
      setCode("");
      setPhase("sent");
    } else refuse(answer, was === "sent" ? "sent" : "ready");
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
    const answer = await checkDealerOtp({ applicationId, ticket, code: digits }).catch(() => FAILED);
    if (answer.ok) setPhase("verified");
    else refuse(answer, "sent");
  };

  if (phase === "verified") return <FormDone title={t("dealer.verifiedTitle")} body={t("dealer.done")} />;
  if (phase === "skipped" || phase === "fallback") {
    return (
      <div className="flex flex-col gap-3">
        {phase === "fallback" ? <p className="text-label text-ink-2">{t("dealer.otpErrVerify")}</p> : null}
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
        disabled={phase === "checking" || phase === "sending"}
        className="inline-flex min-h-14 w-fit items-center text-label text-neel underline underline-offset-4 disabled:text-ink-3"
      >
        {t("dealer.otpSkip")}
      </button>
    </div>
  );
}
