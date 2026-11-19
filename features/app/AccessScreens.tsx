"use client";

// What /app shows before the app itself (DECISIONS R26): sign in with Google; wait for the founders' approval
// (with the profile, an edit, and the /try demo meanwhile); or a blocked account. Each is a whole page, without
// the app frame (which would ask for orders this person may not read). account.me is reactive, so an approval
// in the admin panel opens the app here without a reload.
import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { GoogleMark } from "@/components/mb/GoogleMark";
import { CheckBold, ClockBold, StopBold } from "@/components/mb/icons";
import { Wordmark } from "@/components/mb/Wordmark";
import { LangSwitch } from "@/features/i18n/LangSwitch";
import { spacedPhone } from "@/lib/profile";
import { useT } from "@/lib/i18n/useT";
import { ProfileForm, type Profile } from "./ProfileForm";

function Page({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-6 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-6">
      <header className="flex items-center justify-between gap-3">
        <Wordmark label={t("brand.name")} height={30} />
        <LangSwitch label={t("home.langSwitch")} />
      </header>
      {children}
    </main>
  );
}

function useLogOut() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
      router.replace("/app");
      router.refresh();
    }
  };
  return { busy, logOut };
}

/** Signed out, or an old anonymous session (before R26): continue with Google. */
export function SignInScreen({ oldSession = false }: { oldSession?: boolean }) {
  const { t } = useT();
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      // Navigates to Google; the page comes back to /app signed in.
      await signIn("google", { redirectTo: "/app" });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Page>
      <section className="flex flex-1 flex-col gap-5" aria-labelledby="signin-title">
        <h1 id="signin-title" className="font-display text-title-1">
          {t("signin.title")}
        </h1>
        <p className="text-body-lg text-ink-2">{t("signin.body")}</p>
        {oldSession ? <p className="border-l-4 border-haldi pl-3 text-label">{t("signin.oldSession")}</p> : null}
        <ul className="flex flex-col gap-2 rounded-card border border-rule bg-card p-4">
          {(["signin.step1", "signin.step2", "signin.step3"] as const).map((k, i) => (
            <li key={k} className="flex items-start gap-3 text-body">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink font-mono text-label">
                {i + 1}
              </span>
              <span className="pt-0.5">{t(k)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-3">
          {failed ? (
            <p role="alert" className="text-label text-lal">
              {t("signin.failed")}
            </p>
          ) : null}
          <PrimaryButton onClick={start} disabled={busy} aria-busy={busy} icon={<GoogleMark className="size-6 shrink-0" />}>
            {busy ? t("signin.opening") : t("signin.google")}
          </PrimaryButton>
          <p className="text-meta text-ink-2">
            {t("signin.privacyNote")}{" "}
            <Link href="/privacy" className="text-neel underline underline-offset-4">
              {t("waitlist.privacyLink")}
            </Link>
          </p>
        </div>
      </section>
    </Page>
  );
}

/** Profile saved; a founder hasn't approved yet. */
export function PendingScreen({ email, profile }: { email: string | null; profile: Profile }) {
  const { t } = useT();
  const { busy, logOut } = useLogOut();
  const [editing, setEditing] = useState(false);

  return (
    <Page>
      <section className="flex flex-1 flex-col gap-5" aria-labelledby="pending-title">
        <p className="flex items-center gap-2 text-label text-hara">
          <CheckBold aria-hidden="true" className="size-5 shrink-0" />
          {t("pending.saved")}
        </p>
        <h1 id="pending-title" className="font-display text-title-1">
          {t("pending.title", { name: profile.name })}
        </h1>
        <p className="flex items-start gap-3 rounded-card border border-rule bg-cement p-4 text-body text-ink">
          <ClockBold aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
          <span>{t("pending.body")}</span>
        </p>

        <section aria-labelledby="pending-profile" className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
          <h2 id="pending-profile" className="font-display text-title-2">
            {t("pending.yourDetails")}
          </h2>
          {editing ? (
            <ProfileForm profile={profile} onDone={() => setEditing(false)} />
          ) : (
            <>
              <dl className="flex flex-col gap-2 text-body">
                <div className="flex flex-col">
                  <dt className="text-meta text-ink-2">{t("onboarding.nameLabel")}</dt>
                  <dd>{profile.name}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-meta text-ink-2">{t("onboarding.phoneLabel")}</dt>
                  <dd className="font-mono">{profile.phone === null ? "—" : spacedPhone(profile.phone)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-meta text-ink-2">{t("onboarding.addressLabel")}</dt>
                  <dd className="break-words">{profile.address ?? "—"}</dd>
                </div>
                {email !== null ? (
                  <div className="flex flex-col">
                    <dt className="text-meta text-ink-2">{t("pending.google")}</dt>
                    <dd className="break-all">{email}</dd>
                  </div>
                ) : null}
              </dl>
              <SecondaryButton onClick={() => setEditing(true)} className="w-full sm:w-fit">
                {t("pending.edit")}
              </SecondaryButton>
            </>
          )}
        </section>

        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/try"
            className="flex min-h-14 items-center justify-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label"
          >
            {t("pending.tryDemo")}
          </Link>
          <button
            type="button"
            onClick={logOut}
            disabled={busy}
            className="inline-flex min-h-14 w-fit items-center text-label text-neel underline underline-offset-4 disabled:text-ink-3"
          >
            {t("logout.button")}
          </button>
        </div>
      </section>
    </Page>
  );
}

/** A founder blocked this account. */
export function BlockedScreen({ email }: { email: string | null }) {
  const { t } = useT();
  const { busy, logOut } = useLogOut();
  return (
    <Page>
      <section className="flex flex-1 flex-col gap-5" aria-labelledby="blocked-title">
        <h1 id="blocked-title" className="flex items-center gap-3 font-display text-title-1">
          <StopBold aria-hidden="true" className="size-8 shrink-0 text-lal" />
          {t("blocked.title")}
        </h1>
        <p className="text-body-lg text-ink-2">{t("blocked.body")}</p>
        {email !== null ? <p className="break-all text-meta text-ink-2">{t("blocked.signedInAs", { email })}</p> : null}
        <div className="mt-auto">
          <PrimaryButton onClick={logOut} disabled={busy} aria-busy={busy}>
            {t("logout.button")}
          </PrimaryButton>
        </div>
      </section>
    </Page>
  );
}
