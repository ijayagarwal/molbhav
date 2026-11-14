"use client";

import { formatPaise } from "@/lib/numbers";
import { Stamp } from "./Stamp";

// BestSoFarRibbon (DESIGN §11): sticky strip on the sweep board, "अभी तक सबसे सस्ता: ₹2,00,610 · dealer",
// ink painted shadow; the total stamps again whenever it changes.
export function BestSoFarRibbon({ label, dealerName, paise }: { label: string; dealerName: string | null; paise: number | null }) {
  return (
    <div className="sticky top-0 z-10 flex min-h-[72px] items-center justify-between gap-3 rounded-card border-2 border-ink bg-card px-4 py-3 shadow-paint">
      <div className="flex min-w-0 flex-col">
        <span className="text-meta text-ink-2">{label}</span>
        <span className="truncate text-label">{dealerName ?? "—"}</span>
      </div>
      {paise !== null ? (
        <Stamp stampKey={paise}>
          <span className="font-digits text-title-2">{formatPaise(paise)}</span>
        </Stamp>
      ) : null}
    </div>
  );
}
