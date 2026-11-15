import Link from "next/link";
import { MotionRoot } from "@/components/mb/MotionRoot";
import { Wordmark } from "@/components/mb/Wordmark";
import { ComponentGallery, DeskRowsGallery } from "@/features/styleguide/ComponentGallery";
import { getDict } from "@/lib/i18n/getDict";
import { getServerDict } from "@/lib/i18n/server";
import { formatINR } from "@/lib/numbers";
import { CONTRAST_PAIRS, contrast, LIGHT, type ColorToken } from "@/lib/tokens";

// The styleguide (PROMPTS 1B item 6, 2B): tokens, contrast, type scale, wordmark and shape, then every
// component in DESIGN §11 in every state, in hi and en side by side. The full shells are at /styleguide/shell.

const SWATCH_BG: Record<ColorToken, string> = {
  paper: "bg-paper", card: "bg-card", cement: "bg-cement", rule: "bg-rule", ink: "bg-ink", "ink-2": "bg-ink-2",
  "ink-3": "bg-ink-3", haldi: "bg-haldi", lal: "bg-lal", hara: "bg-hara", neel: "bg-neel",
  "paint-shadow": "bg-paint-shadow", "on-lal": "bg-on-lal",
};
const FG: Record<ColorToken, string> = {
  paper: "text-paper", card: "text-card", cement: "text-cement", rule: "text-rule", ink: "text-ink", "ink-2": "text-ink-2",
  "ink-3": "text-ink-3", haldi: "text-haldi", lal: "text-lal", hara: "text-hara", neel: "text-neel",
  "paint-shadow": "text-paint-shadow", "on-lal": "text-on-lal",
};

const TYPE_SCALE = [
  { token: "price-hero", className: "font-digits text-price-hero", digits: true },
  { token: "title-1", className: "font-display text-title-1" },
  { token: "title-2", className: "font-display text-title-2" },
  { token: "body-lg", className: "text-body-lg" },
  { token: "body", className: "text-body" },
  { token: "label", className: "text-label" },
  { token: "meta", className: "text-meta text-ink-2" },
  { token: "ledger", className: "font-mono text-ledger", digits: true },
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6">
      <h2 className="font-display text-title-2">{title}</h2>
      {children}
    </section>
  );
}

export default async function StyleguidePage() {
  const { t, tf } = await getServerDict();
  const hi = getDict("hi");
  const en = getDict("en");

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-8 sm:px-5 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Wordmark label={t["brand.name"]} height={44} withLatin />
        <p className="text-label text-ink-2">{t["styleguide.title"]}</p>
      </header>

      <Section title={t["styleguide.colours"]}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(LIGHT) as ColorToken[]).map((token) => (
            <li key={token} className="flex flex-col gap-2 rounded-card border border-rule bg-card p-3">
              <span className={`h-14 rounded-parchi border border-rule ${SWATCH_BG[token]}`} />
              <span className="text-label">{token}</span>
              <span className="font-mono text-meta text-ink-2">{LIGHT[token]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t["styleguide.contrast"]}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONTRAST_PAIRS.map((p) => {
            const ratio = contrast(LIGHT[p.fg], LIGHT[p.bg]);
            return (
              <li key={`${p.fg}-${p.bg}`} className={`flex items-center justify-between gap-3 rounded-card border border-rule p-4 ${SWATCH_BG[p.bg]}`}>
                <span className={`font-display text-title-2 ${FG[p.fg]}`}>{t["brand.name"]}</span>
                <span className="flex flex-col items-end">
                  <span className={`font-mono text-ledger ${FG[p.fg]}`}>{ratio.toFixed(1)}:1</span>
                  <span className={`text-meta ${FG[p.fg]}`}>{tf("styleguide.minimum", { min: p.min, use: p.use })}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t["styleguide.type"]}>
        <div className="grid gap-6 lg:grid-cols-2">
          {[{ lang: "hi" as const, dict: hi, sample: hi["styleguide.sampleHi"] }, { lang: "en" as const, dict: en, sample: en["styleguide.sampleEn"] }].map(({ lang, dict, sample }) => (
            <div key={lang} lang={lang} className="flex flex-col gap-4 rounded-card border border-rule bg-card p-4">
              {TYPE_SCALE.map((s) => (
                <div key={s.token} className="flex flex-col gap-1 border-b border-rule pb-3 last:border-b-0">
                  <span className="font-mono text-meta text-ink-3">{s.token}</span>
                  <span className={s.className}>
                    {"digits" in s && s.digits ? formatINR(200610) : s.token.startsWith("title") ? dict["home.title"] : sample}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t["styleguide.shape"]}>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex h-16 w-40 items-center justify-center rounded-card border border-rule bg-card text-label">12 · card</div>
          <div className="flex h-16 w-40 items-center justify-center rounded-parchi border-2 border-ink bg-card text-label shadow-paint">4 · parchi</div>
          <div className="flex h-16 w-40 items-center justify-center rounded-t-sheet border border-rule bg-card text-label">20 · sheet</div>
          <div className="flex h-16 w-40 items-center justify-center rounded-card bg-haldi text-label shadow-paint-sm">paint-sm</div>
          <div className="flex h-16 w-40 items-center justify-center rounded-card bg-haldi text-label shadow-paint">paint</div>
          <button type="button" className="press-paint flex h-16 w-40 items-center justify-center rounded-card bg-haldi text-label shadow-paint-lg">
            paint-lg
          </button>
        </div>
      </Section>

      <Section title={t["styleguide.layouts"]}>
        <div className="flex flex-wrap gap-3">
          <Link href="/styleguide/shell" className="inline-flex min-h-14 items-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
            {t["styleguide.openShell"]}
          </Link>
          <Link href="/styleguide/money-shot" className="inline-flex min-h-14 items-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
            {t["moneyShot.title"]}
          </Link>
        </div>
      </Section>

      <Section title={t["styleguide.components"]}>
        <MotionRoot>
          <ComponentGallery hi={hi} en={en} />
          <section className="flex flex-col gap-3 border-t border-rule pt-6">
            <h3 className="font-mono text-label text-ink-2">{"DealerRow · desk"}</h3>
            <div lang="hi">
              <DeskRowsGallery dict={hi} lang="hi" />
            </div>
            <div lang="en">
              <DeskRowsGallery dict={en} lang="en" />
            </div>
          </section>
        </MotionRoot>
      </Section>

      <Section title={t["styleguide.wordmark"]}>
        <div className="flex flex-wrap items-end gap-8">
          <Wordmark label={t["brand.name"]} height={64} />
          <Wordmark label={t["brand.name"]} height={32} withLatin />
          <span className="rounded-card bg-ink p-4">
            <Wordmark label={t["brand.name"]} height={32} className="[&_path:last-child]:fill-paper" />
          </span>
        </div>
      </Section>
    </main>
  );
}
