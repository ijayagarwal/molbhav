"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

// DECISIONS F7: LazyMotion + m with domAnimation (small bundle), and MotionConfig reducedMotion="user" so
// every animation becomes an instant state change plus a fade when the OS asks for reduced motion.
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
