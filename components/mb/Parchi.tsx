import { formatPaise } from "@/lib/numbers";
import { PriceHero } from "./PriceHero";

// Parchi (DESIGN §11, D2): the result receipt. White card, 2 px ink border, radius 4, perforated bottom,
// painted ink shadow. Dealer name, landed total (price hero), item lines, GST, delivery and unloading,
// chips for delivery time, credit, bill and weighing. In sim or sandbox: a "DEMO · काल्पनिक dealers" watermark.
export interface ParchiLine {
  label: string;
  /** paise, or a word such as "मुफ़्त" */
  amount: number | string;
  tone?: "hara";
}

interface Props {
  heading: string;
  status: string;
  dealerName: string;
  totalPaise: number;
  allInLabel: string;
  lines: ParchiLine[];
  chips: string[];
  watermark?: string;
}

export function Parchi({ heading, status, dealerName, totalPaise, allInLabel, lines, chips, watermark }: Props) {
  return (
    <article className="relative overflow-hidden rounded-parchi border-2 border-ink bg-card shadow-paint-lg">
      {watermark ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 whitespace-nowrap font-display text-title-1 text-cement opacity-60">{watermark}</span>
        </span>
      ) : null}
      <div className="relative flex flex-col gap-3 px-4 pb-6 pt-4">
        <header className="flex items-center justify-between text-meta">
          <span className="text-ink-2">{heading}</span>
          <span className="font-ui-semibold text-hara">{status}</span>
        </header>
        <h3 className="font-display text-title-2">{dealerName}</h3>
        <div className="min-w-0 overflow-hidden">
          <PriceHero paise={totalPaise} />
        </div>
        <p className="text-meta text-ink-2">{allInLabel}</p>
        <dl className="flex flex-col gap-1.5 border-t border-dashed border-rule pt-3">
          {lines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-meta text-ink">{l.label}</dt>
              <dd className={`font-mono text-ledger ${l.tone === "hara" ? "text-hara" : "text-ink"}`}>
                {typeof l.amount === "number" ? formatPaise(l.amount).replace("₹", "") : l.amount}
              </dd>
            </div>
          ))}
        </dl>
        <ul className="flex flex-wrap gap-2 pt-1">
          {chips.map((c) => (
            <li key={c} className="rounded-card bg-cement px-2.5 py-1 text-label">
              {c}
            </li>
          ))}
        </ul>
      </div>
      {/* Perforated bottom edge (D2): paper-coloured teeth cut into the receipt. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2.5"
        style={{
          background:
            "linear-gradient(135deg, var(--paper) 50%, transparent 50%) 0 100% / 12px 12px repeat-x, linear-gradient(225deg, var(--paper) 50%, transparent 50%) 0 100% / 12px 12px repeat-x",
        }}
      />
    </article>
  );
}
