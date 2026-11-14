"use client";

import { useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { formatPaise } from "@/lib/numbers";

// Signature motion 5, "Tally" (DESIGN §9, D6): a 600 ms per-digit odometer to the saving, in the price-hero
// digits. Each digit is a column of 0–9 that rolls into place (a CSS keyframe that restarts whenever the
// tally remounts); separators and ₹ stay still. With reduced motion the digits simply appear.
export function Tally({ paise, run, className }: { paise: number; run: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const text = formatPaise(paise);
  return (
    <span key={`${run}-${paise}`} className={`font-digits inline-flex leading-none ${className ?? ""}`} aria-label={text} role="img">
      {[...text].map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          );
        }
        const digit = run ? Number(ch) : 0;
        const style = {
          "--digit": digit,
          transform: `translateY(-${digit}em)`,
          animation: run && !reduced ? `mb-odometer 600ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 40}ms both` : "none",
        } as CSSProperties;
        return (
          <span key={i} aria-hidden="true" className="relative inline-block h-[1em] overflow-hidden">
            <span className="flex flex-col" style={style}>
              {Array.from({ length: 10 }, (_, d) => (
                <span key={d} className="block h-[1em]">
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
