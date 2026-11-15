"use client";

import { m } from "motion/react";
import { formatPaise } from "@/lib/numbers";
import { PhoneBold, XBold } from "./icons";
import { PriceStrike } from "./PriceStrike";
import { SlotChecklist, type Slots } from "./SlotChecklist";
import { Stamp } from "./Stamp";
import { WinnerSwipe } from "./WinnerSwipe";

// DealerRow (DESIGN §11, §12.5, D5–D7). Presentational: every word comes in through props. 72 px rows.
// Phone: avatar, name, area, state body, total on the right. Desk: the ledger row (Dealer 1fr · Status 144 ·
// Landed 140 · Credit 80 · Delivery 104) with the latest line as the row's second line.

export type RowState = "queued" | "ringing" | "talking" | "quoted" | "noAnswer" | "held" | "notComparable";

export interface DealerRowProps {
  layout: "phone" | "desk";
  name: string;
  initials: string;
  area: string;
  state: RowState;
  /** The status word for the state (from the dictionary). */
  statusLabel: string;
  /** Talking: elapsed seconds, the slot checklist and, in sim only, the DEMO caption (D7). */
  elapsedS?: number;
  slots?: Slots;
  slotLabels: Record<keyof Slots, string>;
  caption?: string;
  demoLabel: string;
  /** Quoted: landed total (paise); a haggle drop shows as a strike from → to. */
  totalPaise?: number;
  strike?: { fromPaise: number; toPaise: number; droppedLabel: string; variant: number };
  totalNote?: string;
  /** Badges such as "आपके dealer", and a held/flag line under the name. */
  badge?: string;
  note?: string;
  noteTone?: "lal" | "ink";
  /** Desk ledger columns. */
  credit?: string;
  delivery?: string;
  winner?: boolean;
}

function Avatar({ initials, ringing }: { initials: string; ringing: boolean }) {
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-cement font-display text-label">
      {initials}
      {ringing ? (
        <m.span
          className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-card text-neel"
          animate={{ rotate: [0, -14, 14, -14, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <PhoneBold className="size-3.5" />
        </m.span>
      ) : null}
    </span>
  );
}

function TotalCell({ p }: { p: DealerRowProps }) {
  if (p.strike) return <PriceStrike {...p.strike} winner={p.winner} />;
  if (p.totalPaise === undefined) return null;
  return (
    <span className="flex flex-col items-end">
      <span className="relative isolate inline-flex">
        {p.winner ? <WinnerSwipe /> : null}
        <Stamp stampKey={p.totalPaise}>
          <span className={`font-mono text-ledger font-semibold ${p.state === "notComparable" ? "text-ink-2" : "text-ink"}`}>{formatPaise(p.totalPaise)}</span>
        </Stamp>
      </span>
      {p.totalNote ? <span className="text-meta text-ink-2">{p.totalNote}</span> : null}
    </span>
  );
}

function Body({ p }: { p: DealerRowProps }) {
  const timer = p.elapsedS !== undefined ? `${Math.floor(p.elapsedS / 60)}:${String(p.elapsedS % 60).padStart(2, "0")}` : null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {p.badge ? <span className="w-fit rounded-card border border-ink px-2 text-label">{p.badge}</span> : null}
      {p.state === "talking" || p.state === "ringing" ? (
        <span className="flex items-center gap-2 text-label text-neel">
          {p.statusLabel}
          {timer && p.state === "talking" ? <span className="font-mono text-meta">{timer}</span> : null}
        </span>
      ) : p.state === "noAnswer" ? (
        <span className="flex items-center gap-1 text-label text-ink-2">
          <XBold className="size-4" />
          {p.statusLabel}
        </span>
      ) : p.layout === "phone" && p.state !== "held" ? (
        <span className="text-meta text-ink-2">{p.area}</span>
      ) : null}
      {p.state === "talking" && p.slots ? <SlotChecklist slots={p.slots} labels={p.slotLabels} /> : null}
      {p.state === "talking" && p.caption ? (
        <m.p
          key={p.caption}
          className="max-w-[260px] rounded-card bg-cement px-2.5 py-1.5 text-meta text-ink"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
          <span className="mr-1 font-mono text-ink-2">{p.demoLabel}</span>
          {p.caption}
        </m.p>
      ) : null}
    </div>
  );
}

function Note({ p }: { p: DealerRowProps }) {
  if (!p.note) return null;
  return <span className={`w-fit text-label ${p.noteTone === "lal" ? "rounded-card border border-lal px-2 text-lal" : "text-ink-2"}`}>{p.note}</span>;
}

export function DealerRow(p: DealerRowProps) {
  if (p.layout === "desk") {
    return (
      <div role="row" className="relative grid min-h-[72px] grid-cols-[minmax(0,1fr)_144px_140px_80px_104px] items-center gap-3 border-b border-rule px-4 py-2">
        <div role="cell" className="relative flex min-w-0 items-center gap-3">
          <Avatar initials={p.initials} ringing={p.state === "ringing"} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-label">{p.name}</span>
            <span className="truncate text-meta text-ink-2">{p.caption && p.state === "talking" ? `${p.demoLabel} ${p.caption}` : p.note ?? p.area}</span>
          </div>
        </div>
        <div role="cell" className={`relative text-label ${p.state === "talking" || p.state === "ringing" ? "text-neel" : p.state === "notComparable" ? "text-lal" : "text-ink-2"}`}>
          {p.statusLabel}
        </div>
        <div role="cell" className="relative flex justify-end">
          <TotalCell p={p} />
        </div>
        <div role="cell" className="relative text-meta text-ink-2">{p.credit ?? ""}</div>
        <div role="cell" className="relative text-meta text-ink-2">{p.delivery ?? ""}</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[72px] flex-col gap-1.5 border-b border-rule px-4 py-3">
      <div className="flex items-start gap-3">
        <Avatar initials={p.initials} ringing={p.state === "ringing"} />
        <div className="relative flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-display text-title-2">{p.name}</span>
          <Body p={p} />
        </div>
        <div className="relative shrink-0 pt-1">
          <TotalCell p={p} />
        </div>
      </div>
      {p.note ? (
        <div className="pl-[52px]">
          <Note p={p} />
        </div>
      ) : null}
    </div>
  );
}
