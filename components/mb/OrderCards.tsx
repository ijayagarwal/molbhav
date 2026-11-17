import type { ReactNode } from "react";
import { SecondaryButton } from "./Buttons";
import { Chip } from "./Chip";
import { KeyboardBold, MicBold } from "./icons";

// TranscriptCard and ItemCard (DESIGN §11, §12.3, design/reference/Confirm.html). Props only.

/** Exactly what was heard, with "ठीक कीजिए" (fix), which re-opens the mic or a text field. */
export function TranscriptCard({ text, fixLabel, onFix }: { text: string; fixLabel: string; onFix?: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <p className="min-w-0 flex-1 text-body text-ink-2">{`“${text}”`}</p>
      {onFix ? (
        <button
          type="button"
          onClick={onFix}
          className="inline-flex min-h-14 shrink-0 touch-manipulation items-center rounded-card border-[1.5px] border-ink bg-card px-3 text-label active:scale-[0.97]"
        >
          {fixLabel}
        </button>
      ) : null}
    </div>
  );
}

export interface SpecChip {
  label: string;
  /** A missing attribute: a lal dashed "Grade?" chip that opens a choice sheet. */
  missing?: boolean;
  onClick?: () => void;
}

/** One order line: label, quantity in the ledger font with its unit, a chip per attribute, then any tier question. */
export function ItemCard({ title, quantity, unit, specs, children }: { title: string; quantity: string | null; unit: string; specs: SpecChip[]; children?: ReactNode }) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate font-display text-title-2">{title}</h3>
        <span className="flex shrink-0 items-baseline gap-2 font-display text-title-2">
          <span className={`font-mono font-semibold tabular-nums ${quantity === null ? "text-lal" : ""}`}>{quantity ?? "?"}</span>
          {unit}
        </span>
      </header>
      {specs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {specs.map((s) => (
            <Chip key={s.label} label={s.label} selected={!s.missing} required={s.missing} onClick={s.onClick} />
          ))}
        </div>
      ) : null}
      {children}
    </article>
  );
}

/**
 * A question on Confirm that a chip can't answer yet (a missing quantity or unit, a bar size said in suta):
 * a lal-dashed block with what we didn't catch and two ways to fix the order, typing or speaking again.
 */
export function FixQuestion({ text, typeLabel, sayLabel, onType, onSay }: { text: string; typeLabel: string; sayLabel: string; onType: () => void; onSay: () => void }) {
  return (
    <div role="group" aria-label={text} className="flex flex-col gap-3 rounded-card border-2 border-dashed border-lal p-3">
      <p className="text-label text-lal">{text}</p>
      <div className="flex flex-wrap gap-2">
        <SecondaryButton icon={<KeyboardBold className="size-5" />} onClick={onType}>
          {typeLabel}
        </SecondaryButton>
        <SecondaryButton icon={<MicBold className="size-5" />} onClick={onSay}>
          {sayLabel}
        </SecondaryButton>
      </div>
    </div>
  );
}

/** The three fact tiles under the items: site, by when, credit (Confirm.html). Tappable ones open a choice sheet. */
export function FactTiles({ facts }: { facts: { label: string; value: string; onClick?: () => void }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {facts.map((f) => {
        const body = (
          <>
            <span className="text-meta text-ink-2">{f.label}</span>
            <span className="text-label [overflow-wrap:anywhere]">{f.value}</span>
          </>
        );
        return f.onClick ? (
          <button key={f.label} type="button" onClick={f.onClick} className="flex min-h-14 min-w-0 flex-col items-start rounded-card bg-cement px-3 py-2 text-left active:scale-[0.97]">
            {body}
          </button>
        ) : (
          <div key={f.label} className="flex min-h-14 min-w-0 flex-col rounded-card bg-cement px-3 py-2">
            {body}
          </div>
        );
      })}
    </div>
  );
}
