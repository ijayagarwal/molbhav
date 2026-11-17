// The landing hero board's frame (DESIGN §21.1, design/reference/Landing.html's phone frame on our tokens) and
// its still first frame. No motion and no state, so the landing's first load carries none of the animation
// code: HeroBoardLazy shows this until the live board (HeroBoard.tsx) has loaded after the page, then swaps
// it in place. The frame has a fixed size, so the swap moves nothing around it.
import type { ReactNode, Ref } from "react";
import { ModeBadge } from "@/components/mb/ModeBadge";

const FRAME = "relative mx-auto h-[600px] w-full max-w-[400px] overflow-hidden rounded-sheet border-8 border-ink bg-paper shadow-paint-lg lg:h-[640px]";

export function HeroFigure({ frameRef, caption, control, children }: { frameRef?: Ref<HTMLDivElement>; caption: string; control?: ReactNode; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-3">
      {/* A looping picture of the flow: screen readers get the caption instead of a stream of changes. */}
      <div ref={frameRef} aria-hidden="true" className={FRAME}>
        {children}
      </div>
      <figcaption className="mx-auto flex min-h-14 w-full max-w-[400px] items-center justify-between gap-3">
        <span className="text-meta text-ink-2">{caption}</span>
        {control}
      </figcaption>
    </figure>
  );
}

/** The board's head (title, DEMO, progress) as plain markup, shared by the still frame. */
export function HeroHead({ title, demo, progress, pct }: { title: string; demo: string; progress: string; pct: number }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-display text-title-2">{title}</span>
        <ModeBadge mode="sim" label={demo} />
      </div>
      <div className="flex items-center gap-3">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-cement">
          <span className="block h-full origin-left bg-ink transition-transform duration-300" style={{ transform: `scaleX(${pct})` }} />
        </span>
        <span className="text-label">{progress}</span>
      </div>
    </>
  );
}

/** The still frame before the live board arrives: the head, an empty ribbon and five dealer rows waiting. */
export function HeroStill({ title, demo, progress, best, rows }: { title: string; demo: string; progress: string; best: string; rows: { name: string; area: string }[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 p-4">
        <HeroHead title={title} demo={demo} progress={progress} pct={0} />
        <div className="flex min-h-[72px] items-center rounded-card border-2 border-ink bg-card px-4 py-3 shadow-paint">
          <span className="text-meta text-ink-2">{best}</span>
        </div>
      </div>
      <div className="border-t border-rule">
        {rows.map((r) => (
          <div key={r.name} className="flex min-h-[72px] items-start gap-3 border-b border-rule px-4 py-3">
            <span className="size-10 shrink-0 rounded-full bg-cement" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-display text-title-2">{r.name}</span>
              <span className="text-meta text-ink-2">{r.area}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
