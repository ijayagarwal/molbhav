"use client";

import { useLayoutEffect, useRef } from "react";
import { formatPaise } from "@/lib/numbers";

// Money never wraps (D4, DESIGN §6): the price hero steps its width 125 → 112 → 100, then its size
// 44 → 40 → 36 (scaled up on desktop through --fs-price-hero) until it fits its box. Test case: ₹12,40,500 at 360 px.
// Fitting measures and sets the element directly (no React state), again on resize and when a face loads.
const STEPS = [
  { family: "var(--font-digits-125)", scale: 1 },
  { family: "var(--font-digits-112)", scale: 1 },
  { family: "var(--font-digits-100)", scale: 1 },
  { family: "var(--font-digits-100)", scale: 40 / 44 },
  { family: "var(--font-digits-100)", scale: 36 / 44 },
  // Beyond D4's steps: in a box narrower than any real screen, keep shrinking rather than clip money.
  { family: "var(--font-digits-100)", scale: 30 / 44 },
  { family: "var(--font-digits-100)", scale: 24 / 44 },
] as const;

function apply(el: HTMLElement, i: number) {
  el.style.fontFamily = `${STEPS[i].family}, var(--font-anek), system-ui`;
  el.style.fontSize = `calc(var(--fs-price-hero) * ${STEPS[i].scale})`;
  el.dataset.step = String(i);
}

export function PriceHero({ paise, className }: { paise: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      // The box's content width (clientWidth includes its padding).
      const cs = getComputedStyle(box);
      const available = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      for (let i = 0; i < STEPS.length; i++) {
        apply(el, i);
        if (el.scrollWidth <= available + 0.5) return;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    document.fonts?.addEventListener?.("loadingdone", fit);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [paise]);

  return (
    <span ref={ref} className={`font-digits inline-block leading-none ${className ?? ""}`} style={{ fontFamily: `${STEPS[0].family}, var(--font-anek), system-ui`, fontSize: "var(--fs-price-hero)" }}>
      {formatPaise(paise)}
    </span>
  );
}
