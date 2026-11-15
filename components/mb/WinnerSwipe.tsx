"use client";

import { m } from "motion/react";

/**
 * Signature motion 7, "Winner" (DESIGN §9): a haldi highlighter swipe behind the winning total, once.
 * Yellow means only "the winner" or "your action" (DESIGN §5), so nothing else in a row is haldi.
 * Place it as the first child of a `relative isolate inline-flex` wrapper around the total.
 */
export function WinnerSwipe() {
  return (
    <m.span
      aria-hidden="true"
      className="absolute inset-x-[-6px] inset-y-[-3px] -z-10 origin-left rounded-parchi bg-haldi"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    />
  );
}
