import { formatPaise } from "@/lib/numbers";
import { SecondaryButton } from "./Buttons";
import { PhoneBold, WarningBold } from "./icons";

// MissingInfo (DECISIONS R28; DESIGN §12.7 item 4). Props only: one dealer's quote with what it still misses
// ("बाकी जानकारी"), and the "call again to ask" action, its calling state, or why it isn't available. Card
// with a 1 px rule border, lal warning marks on each missing item, a 56 px secondary button.

export interface MissingInfoProps {
  dealerName: string;
  /** The quote's landed total (paise), shown so the row reads like the table. */
  totalPaise?: number;
  /** "Not yet confirmed with {dealer}:" */
  heading: string;
  /** Each gap, in plain words. Empty: nothing is missing (the card shows only `done`). */
  items: string[];
  /** The button, when a follow-up can start. */
  action?: { label: string; onClick: () => void; busy: boolean };
  /** The follow-up is on now. */
  calling?: string;
  /** Why the button isn't there (placed, limit reached, live calls not available, …). */
  unavailable?: string;
  /** Shown after a follow-up completed the quote. */
  done?: string;
  /** A failed start. */
  error?: string;
}

export function MissingInfo(p: MissingInfoProps) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate font-display text-title-2">{p.dealerName}</h3>
        {p.totalPaise !== undefined ? <span className="shrink-0 whitespace-nowrap font-mono text-ledger text-ink-2">{formatPaise(p.totalPaise)}</span> : null}
      </header>
      {p.items.length > 0 ? (
        <>
          <p className="text-label text-ink-2">{p.heading}</p>
          <ul className="flex flex-col gap-1.5">
            {p.items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-body">
                <WarningBold className="mt-1 size-4 shrink-0 text-lal" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {p.done ? <p className="text-label text-hara">{p.done}</p> : null}
      {p.calling ? (
        <p role="status" aria-live="polite" className="flex min-h-14 items-center gap-2 rounded-card bg-cement px-4 text-label text-neel">
          <PhoneBold className="size-5 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
          {p.calling}
        </p>
      ) : p.action ? (
        <SecondaryButton icon={<PhoneBold className="size-5" />} onClick={p.action.onClick} disabled={p.action.busy} aria-busy={p.action.busy}>
          {p.action.label}
        </SecondaryButton>
      ) : p.unavailable && p.items.length > 0 ? (
        <p className="text-meta text-ink-2">{p.unavailable}</p>
      ) : null}
      {p.error ? (
        <p role="alert" className="text-label text-lal">
          {p.error}
        </p>
      ) : null}
    </section>
  );
}
