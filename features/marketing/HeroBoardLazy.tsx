"use client";

// The landing's only client island for the hero (DESIGN §21.1, PROMPTS Phase 7 item 2; Lighthouse mobile ≥ 90):
// it paints the board's still first frame at once (HeroFrame.tsx: plain markup, no motion), and only after the
// page's load event, when the browser is idle, loads the live board (HeroBoard.tsx with the motion library) and
// swaps it into the same fixed-size frame. So the first load carries no animation code and nothing moves around
// the frame when it arrives.
import { useEffect, useState, type ComponentType } from "react";
import { useT } from "@/lib/i18n/useT";
import type { HeroBoardData } from "./HeroBoard";
import { HeroFigure, HeroStill } from "./HeroFrame";

type Board = ComponentType<{ data: HeroBoardData }>;
const ORDER = ["agarwal", "omsai", "balaji", "rathore", "gupta"] as const;

export function HeroBoardLazy({ data }: { data: HeroBoardData }) {
  const { t } = useT();
  const [Live, setLive] = useState<Board | null>(null);

  useEffect(() => {
    let cancelled = false;
    let idle = 0;
    const load = () => {
      void import("./HeroBoard").then(
        (mod) => {
          if (!cancelled) setLive(() => mod.HeroBoard);
        },
        () => undefined, // offline or a stale deploy: the still frame stays, which is fine
      );
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(load, { timeout: 2000 });
      else idle = window.setTimeout(load, 300);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
    };
  }, []);

  if (Live) return <Live data={data} />;
  return (
    <HeroFigure caption={t("landing.boardLabel")}>
      <HeroStill
        title={t("sweep.title")}
        demo={t("badge.demo")}
        progress={t("sweep.progress", { done: 0, total: 4 })}
        best={t("sweep.waiting")}
        rows={ORDER.map((k) => data.dealers[k])}
      />
    </HeroFigure>
  );
}
