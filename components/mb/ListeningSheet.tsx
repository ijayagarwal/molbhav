import type { ReactNode } from "react";
import { BackBold, LockBold } from "./icons";
import { PrimaryButton, SecondaryButton } from "./Buttons";

// ListeningSheet (DESIGN §11, §13, design/reference/Listening.html). Props only.
// Over a dark scrim: "सुन रहे हैं…" with a lal dot, a big Plex Mono timer, the cap hint (a countdown in the
// last 5 s), live level bars, a calm line, and the gesture hints. Hold: "slide to cancel" left and the lock
// target right; the mic below says "छोड़िए तो भेज देंगे". Locked: a 56 px "रद्द" and a visible send (V1).

export interface ListeningLabels {
  listening: string;
  capHint: string;
  countdown: string | null;
  calm: string;
  calmMode: string;
  slideCancel: string;
  lock: string;
  release: string;
  tapToSend: string;
  cancel: string;
  send: string;
  processing: string;
}

interface Props {
  mode: "hold" | "locked" | "processing";
  elapsedMs: number;
  /** Recent input levels, 0–1, oldest first. */
  levels: number[];
  /** The current slide while holding (negative dx = towards cancel, negative dy = towards lock). */
  drag?: { dx: number; dy: number };
  labels: ListeningLabels;
  /** The MicButton, so its gestures keep working inside the sheet. */
  mic: ReactNode;
  onCancel?: () => void;
  onSend?: () => void;
  /** Draws in place (styleguide) instead of as a fixed overlay. */
  inline?: boolean;
  /** Text heard so far, once the transcript streams in. */
  transcript?: string;
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ListeningSheet({ mode, elapsedMs, levels, drag = { dx: 0, dy: 0 }, labels, mic, onCancel, onSend, inline = false, transcript }: Props) {
  const cancelling = drag.dx <= -40;
  const locking = drag.dy <= -50;
  return (
    <div className={inline ? "relative flex h-[640px] flex-col overflow-hidden rounded-card bg-ink" : "fixed inset-0 z-40 flex flex-col bg-ink/90"} role="dialog" aria-modal={!inline} aria-label={labels.listening}>
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-3 rounded-t-sheet bg-paper px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 [overscroll-behavior:contain]">
        <span aria-hidden="true" className="h-1.5 w-11 rounded-full bg-rule" />
        <p className="flex items-center gap-2 font-display text-title-1" role="status" aria-live="polite">
          {mode === "processing" ? (
            labels.processing
          ) : (
            <>
              <span aria-hidden="true" className="size-3 rounded-full bg-lal" />
              {labels.listening}
            </>
          )}
        </p>
        {mode === "processing" ? null : (
          <>
            <span className="font-mono text-[44px] font-semibold leading-none tabular-nums">{clock(elapsedMs)}</span>
            <span className={`text-meta ${labels.countdown ? "font-ui-semibold text-lal" : "text-ink-2"}`}>{labels.countdown ?? labels.capHint}</span>
            {/* Level bars: the one looping motion allowed (DESIGN §9), driven by the real input level. */}
            <div aria-hidden="true" className="flex h-24 items-center gap-2.5">
              {levels.map((l, i) => (
                <span key={i} className="w-2 rounded-full bg-ink" style={{ height: `${Math.round(12 + Math.min(1, l) * 80)}px` }} />
              ))}
            </div>
          </>
        )}

        {transcript ? (
          <p className="max-w-[320px] text-center text-body text-ink">{`“${transcript}”`}</p>
        ) : mode === "processing" ? null : (
          <p className="max-w-[320px] text-center text-body text-ink-2">
            {labels.calm}
            <br />
            {labels.calmMode}
          </p>
        )}

        {mode === "hold" ? (
          <div className="flex w-full items-end justify-between pt-2">
            <span className={`flex items-center gap-1 text-label ${cancelling ? "text-lal" : "text-ink-2"}`} style={{ transform: `translateX(${Math.max(-60, Math.min(0, drag.dx))}px)` }}>
              <BackBold className="size-4" />
              {labels.slideCancel}
            </span>
            <span className={`flex flex-col items-center gap-0.5 text-meta ${locking ? "text-ink" : "text-ink-2"}`}>
              <LockBold className="size-5" />
              {labels.lock}
            </span>
          </div>
        ) : mode === "locked" ? (
          <div className="grid w-full grid-cols-2 gap-3 pt-2">
            <SecondaryButton onClick={onCancel}>{labels.cancel}</SecondaryButton>
            <PrimaryButton onClick={onSend} className="h-14 text-label">
              {labels.send}
            </PrimaryButton>
          </div>
        ) : null}

        <div className="pt-3">{mic}</div>
        <span className="text-label">{mode === "hold" ? labels.release : mode === "locked" ? labels.tapToSend : labels.processing}</span>
      </div>
    </div>
  );
}
