"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";

// Signature motion 3, "Stamp" (DESIGN §9): drops in from 1.15× with the stamp spring, a faint ink ring
// ("thappa") behind it. Re-keys on `stampKey`, so a new value stamps again.
export function Stamp({ stampKey, children, className }: { stampKey: string | number; children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ""}`}>
      <m.span
        key={`ring-${stampKey}`}
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-6px] rounded-full border-2 border-ink"
        initial={{ scale: 0.6, opacity: 0.35 }}
        animate={{ scale: 1.25, opacity: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      <m.span
        key={`v-${stampKey}`}
        className="relative inline-flex"
        initial={{ scale: 1.15, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      >
        {children}
      </m.span>
    </span>
  );
}
