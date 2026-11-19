"use client";

// /app/settings: the whole app's language (hi ⇄ en), device sounds, the spoken result (V7), single-key
// shortcuts (WCAG 2.1.4), the person's own details and Google account (R26), the demo-mode note and privacy. Settings belong to a session: a signed-out
// visitor (a fresh browser) is sent to /app, where onboarding starts one.
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { SecondaryButton } from "@/components/mb/Buttons";
import { api } from "@/convex/_generated/api";
import { useLanguage } from "@/features/i18n/useLanguage";
import { setSoundEnabled } from "@/lib/client/earcons";
import { setPref, usePrefs, type Prefs } from "@/lib/client/prefs";
import { CITY_AREAS } from "@/lib/config";
import { useT } from "@/lib/i18n/useT";
import { spacedPhone } from "@/lib/profile";
import { AppFrame } from "./AppFrame";
import { ProfileForm } from "./ProfileForm";
import { useRequireSession } from "./useSession";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <h2 className="font-display text-title-2">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, hint, on, onChange, onLabel, offLabel }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; onLabel: string; offLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-14 w-full items-center justify-between gap-4 border-t border-rule py-2 text-left first:border-t-0"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-label">{label}</span>
        {hint ? <span className="text-meta text-ink-2">{hint}</span> : null}
      </span>
      <span className={`inline-flex h-10 shrink-0 items-center rounded-full border-[1.5px] px-1 ${on ? "border-ink bg-ink" : "border-ink-3 bg-cement"}`}>
        <span className={`sr-only`}>{on ? onLabel : offLabel}</span>
        <span aria-hidden="true" className={`size-7 rounded-full bg-card transition-transform ${on ? "translate-x-6" : "translate-x-0"}`} />
        <span aria-hidden="true" className="w-6" />
      </span>
    </button>
  );
}

export function SettingsScreen() {
  const { t } = useT();
  const { lang, setLang, pending } = useLanguage();
  const prefs = usePrefs();
  const signedIn = useRequireSession();
  const me = useQuery(api.contractors.me, {});
  const account = useQuery(api.account.me, signedIn ? {} : "skip");
  const [editing, setEditing] = useState(false);
  const { signOut } = useAuthActions();
  const setSharePhone = useMutation(api.contractors.setSharePhone);
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState<"ask" | "busy" | null>(null);
  useEffect(() => setSoundEnabled(prefs.sound), [prefs.sound]);

  const logOut = async () => {
    setLoggingOut("busy");
    try {
      await signOut();
    } finally {
      setLoggingOut(null);
      router.replace("/app");
    }
  };

  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPref(k, v);
  const area = me?.site ? CITY_AREAS.Jaipur.find((a) => a.key === me.site?.area) : undefined;

  if (!signedIn) {
    return (
      <AppFrame back={{ href: "/app", label: t("rail.home") }} title={t("settings.title")} phoneDock={null} deskDock={false}>
        <p role="status" aria-busy="true" className="text-body text-ink-2">
          {t("session.connecting")}
        </p>
      </AppFrame>
    );
  }

  return (
    <AppFrame back={{ href: "/app", label: t("rail.home") }} title={t("settings.title")} phoneDock={null} deskDock={false}>
      <h1 className="hidden font-display text-title-1 lg:block">{t("settings.title")}</h1>

      <Group title={t("settings.language")}>
        <div role="radiogroup" aria-label={t("settings.language")} aria-busy={pending} className="grid grid-cols-2 gap-3">
          {(
            [
              { value: "hi", label: "हिंदी" },
              { value: "en", label: "English" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={lang === o.value}
              lang={o.value}
              onClick={() => setLang(o.value)}
              className={`flex h-20 items-center justify-center rounded-card border-2 font-display text-title-2 ${lang === o.value ? "border-ink bg-ink text-paper" : "border-ink bg-card text-ink"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title={t("settings.device")}>
        <div className="flex flex-col">
          <Toggle label={t("settings.sound")} on={prefs.sound} onChange={set("sound")} onLabel={t("settings.on")} offLabel={t("settings.off")} />
          <Toggle label={t("settings.spoken")} on={prefs.spokenResult} onChange={set("spokenResult")} onLabel={t("settings.on")} offLabel={t("settings.off")} />
          <Toggle
            label={t("shortcuts.toggle")}
            hint={t("settings.shortcutsHint")}
            on={prefs.shortcuts}
            onChange={set("shortcuts")}
            onLabel={t("settings.on")}
            offLabel={t("settings.off")}
          />
        </div>
      </Group>

      {area ? (
        <Group title={t("settings.site")}>
          <p className="text-body">{area[lang]}</p>
        </Group>
      ) : null}

      <Group title={t("settings.mode")}>
        <p className="text-body text-ink-2">{t("settings.modeHint")}</p>
      </Group>

      {/* R26: the person's own details (name and number lock once the founders checked them on a call). */}
      {account?.profile ? (
        <Group title={t("settings.profile")}>
          {editing ? (
            <ProfileForm profile={account.profile} onDone={() => setEditing(false)} />
          ) : (
            <>
              <dl className="flex flex-col gap-2 text-body">
                <div className="flex flex-col">
                  <dt className="text-meta text-ink-2">{t("onboarding.nameLabel")}</dt>
                  <dd>{account.profile.name}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-meta text-ink-2">{t("onboarding.phoneLabel")}</dt>
                  <dd className="font-mono">{account.profile.phone === null ? "—" : spacedPhone(account.profile.phone)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-meta text-ink-2">{t("onboarding.addressLabel")}</dt>
                  <dd className="break-words">{account.profile.address ?? "—"}</dd>
                </div>
              </dl>
              <SecondaryButton onClick={() => setEditing(true)} className="w-full sm:w-fit">
                {t("settings.editProfile")}
              </SecondaryButton>
            </>
          )}
        </Group>
      ) : null}

      {/* Log out (the founders asked for it). Signing in again with the same Google account brings everything back. */}
      <Group title={t("settings.account")}>
        {account?.email ? (
          <div className="flex flex-col">
            <span className="text-meta text-ink-2">{t("settings.signedInAs")}</span>
            <span className="break-all text-body">{account.email}</span>
          </div>
        ) : me ? (
          <p className="text-body">{me.name}</p>
        ) : null}
        {me ? (
          <Toggle
            label={t("settings.sharePhone")}
            hint={t("settings.sharePhoneHint")}
            on={me.sharePhoneWithDealers}
            onChange={(v) => void setSharePhone({ share: v })}
            onLabel={t("settings.on")}
            offLabel={t("settings.off")}
          />
        ) : null}
        <SecondaryButton tone="lal" onClick={() => setLoggingOut("ask")}>
          {t("logout.button")}
        </SecondaryButton>
      </Group>

      <p className="px-1 text-meta text-ink-2">{t("settings.privacy")}</p>

      <BottomSheet open={loggingOut !== null} title={t("logout.title")} onClose={() => setLoggingOut(null)} closeLabel={t("panel.close")}>
        <p className="text-body">{t("logout.warning")}</p>
        <div className="flex flex-col gap-3">
          <SecondaryButton tone="lal" onClick={logOut} disabled={loggingOut === "busy"} aria-busy={loggingOut === "busy"}>
            {t("logout.confirm")}
          </SecondaryButton>
          <SecondaryButton onClick={() => setLoggingOut(null)}>{t("logout.cancel")}</SecondaryButton>
        </div>
      </BottomSheet>
    </AppFrame>
  );
}
