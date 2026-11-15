import type { ReactNode } from "react";
import {
  BestBold,
  BusyBold,
  CheckBold,
  ClockBold,
  DeclinedBold,
  DropBold,
  FinalBold,
  MatchBold,
  PhoneBold,
  QueueBold,
  StopBold,
  WarningBold,
  WaveformBold,
  XBold,
} from "./icons";

// StatusPill (DESIGN §11): icon + word, never colour alone. Ringing and talking in neel (talking shows a
// waveform icon in sim only, D7), quoted in ink, best with a haldi fill, no answer in ink-3, declined in lal.

export type PillKind =
  | "queued"
  | "ringing"
  | "talking"
  | "haggling"
  | "matchCall"
  | "quoted"
  | "final"
  | "best"
  | "noAnswer"
  | "busy"
  | "callback"
  | "declined"
  | "notComparable"
  | "cancelled";

const LOOK: Record<PillKind, { cls: string; icon: ReactNode }> = {
  queued: { cls: "border-rule text-ink-2", icon: <QueueBold className="size-4" /> },
  ringing: { cls: "border-neel text-neel", icon: <PhoneBold className="size-4" /> },
  talking: { cls: "border-cement bg-cement text-neel", icon: <WaveformBold className="size-4" /> },
  haggling: { cls: "border-neel text-neel", icon: <DropBold className="size-4" /> },
  matchCall: { cls: "border-neel text-neel", icon: <MatchBold className="size-4" /> },
  quoted: { cls: "border-ink text-ink", icon: <CheckBold className="size-4" /> },
  final: { cls: "border-hara text-hara", icon: <FinalBold className="size-4" /> },
  best: { cls: "border-ink bg-haldi text-ink", icon: <BestBold className="size-4" /> },
  noAnswer: { cls: "border-rule text-ink-3", icon: <XBold className="size-4" /> },
  busy: { cls: "border-rule text-ink-3", icon: <BusyBold className="size-4" /> },
  callback: { cls: "border-rule text-ink-2", icon: <ClockBold className="size-4" /> },
  declined: { cls: "border-lal text-lal", icon: <DeclinedBold className="size-4" /> },
  notComparable: { cls: "border-lal text-lal", icon: <WarningBold className="size-4" /> },
  cancelled: { cls: "border-rule text-ink-3", icon: <StopBold className="size-4" /> },
};

/** `size="sm"` fits the desk ledger's 144 px status column (D5). */
export function StatusPill({ kind, label, sim = true, size = "md" }: { kind: PillKind; label: string; sim?: boolean; size?: "md" | "sm" }) {
  const look = LOOK[kind];
  // Live mode never shows a waveform (D7): the talking pill keeps a plain dot instead.
  const icon = kind === "talking" && !sim ? <span aria-hidden="true" className="size-2 rounded-full bg-neel" /> : look.icon;
  return (
    <span className={`inline-flex max-w-full items-center whitespace-nowrap rounded-card border-[1.5px] bg-card ${size === "sm" ? "h-7 gap-1 px-2 font-ui-semibold text-meta" : "h-8 gap-1.5 px-2.5 text-label"} ${look.cls}`}>
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** "सब कॉल रोकिए": secondary with a lal border, on the sweep while calls run (DESIGN §11). */
export function StopAllButton({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-card border-[1.5px] border-lal bg-card px-4 text-label text-lal active:scale-[0.97] disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-3"
    >
      <StopBold className="size-4" />
      {label}
    </button>
  );
}
