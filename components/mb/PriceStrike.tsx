"use client";

import { m } from "motion/react";
import { formatPaise } from "@/lib/numbers";
import { Stamp } from "./Stamp";

// Signature motion 4, "Strike" (DESIGN §9, D6): a hand-drawn lal line draws across the old number left to
// right over 300 ms (one of 3 seeded path variants), then the new number stamps in below, with "₹X कम हुआ"
// in hara. With reduced motion the strike is a static line.
const PATHS = [
  "M2 12 C 22 8, 44 14, 66 10 S 90 9, 98 11",
  "M1 9 C 18 12, 38 7, 60 11 S 84 13, 99 9",
  "M3 11 Q 28 6, 50 11 T 97 10",
] as const;

interface Props {
  fromPaise: number;
  toPaise: number;
  /** "₹1,350 कम हुआ", already formatted by the caller from the dictionary. */
  droppedLabel: string;
  /** Seeds the path variant, e.g. the dealer's index. */
  variant: number;
  className?: string;
}

export function PriceStrike({ fromPaise, toPaise, droppedLabel, variant, className }: Props) {
  const d = PATHS[((variant % PATHS.length) + PATHS.length) % PATHS.length];
  return (
    <span className={`flex flex-col items-end gap-0.5 ${className ?? ""}`}>
      <span className="relative font-mono text-ledger text-ink-2">
        {formatPaise(fromPaise)}
        <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-[-4px] top-1/2 h-5 w-[calc(100%+8px)] -translate-y-1/2" aria-hidden="true">
          <m.path
            d={d}
            fill="none"
            className="stroke-lal"
            strokeWidth={2.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </svg>
      </span>
      <Stamp stampKey={toPaise} className="rounded-parchi bg-haldi px-1">
        <span className="font-mono text-ledger font-semibold">{formatPaise(toPaise)}</span>
      </Stamp>
      <m.span className="text-meta text-hara" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.24 }}>
        {droppedLabel}
      </m.span>
    </span>
  );
}
