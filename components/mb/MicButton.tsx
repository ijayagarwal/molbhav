import type { KeyboardEvent, PointerEvent } from "react";
import { MicBold, SendBold } from "./icons";

// MicButton (DESIGN §11, V1). 88 px haldi circle (64 px in the desk dock), ink mic icon, painted ink shadow.
// The gestures live in features/voice/useMic.ts; this only draws the state and forwards the handlers.
// Plumbing (F4): touch-action none, no iOS callout, no text selection; pointer capture in the hook.

export type MicButtonView = "idle" | "pressed" | "recording" | "locked" | "processing" | "disabled";

export interface MicBind {
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (e: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

interface Props {
  view: MicButtonView;
  /** Accessible name in the active language ("बोलकर ऑर्डर दीजिए"). */
  ariaLabel: string;
  size?: "lg" | "md";
  bind?: MicBind;
  /** MediaRecorder has started: only then does the red ring show (V2). Pressed but not yet armed shows no ring. */
  armed?: boolean;
}

export function MicButton({ view, ariaLabel, size = "lg", bind, armed = true }: Props) {
  const dim = size === "lg" ? "size-[88px]" : "size-16";
  const icon = size === "lg" ? "size-9" : "size-7";
  const recording = view === "recording" || view === "pressed";
  const look =
    view === "disabled"
      ? "border-rule bg-cement text-ink-3 shadow-none"
      : view === "pressed"
        ? "translate-x-0.5 translate-y-0.5 scale-[0.97] border-ink bg-haldi text-ink shadow-none"
        : "border-ink bg-haldi text-ink shadow-paint";
  return (
    <span className="relative inline-flex items-center justify-center">
      {/* Recording ring (Listening.html): a lal ring with a paper gap, so the state reads without colour alone. */}
      {armed && (recording || view === "locked") ? (
        <span aria-hidden="true" className={`pointer-events-none absolute inset-[-8px] rounded-full border-4 border-lal ${view === "locked" ? "border-dashed" : ""}`} />
      ) : null}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={recording || view === "locked"}
        aria-busy={view === "processing"}
        disabled={view === "disabled"}
        className={`relative inline-flex ${dim} touch-none select-none items-center justify-center rounded-full border-2 transition-transform duration-100 [-webkit-touch-callout:none] [-webkit-user-select:none] ${look}`}
        {...bind}
      >
        {view === "locked" ? (
          <SendBold className={icon} />
        ) : view === "processing" ? (
          <span aria-hidden="true" className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2.5 animate-pulse rounded-full bg-ink" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
        ) : (
          <MicBold className={icon} />
        )}
      </button>
    </span>
  );
}
