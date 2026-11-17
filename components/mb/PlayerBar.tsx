import { PauseBold, PlayBold } from "./icons";

// The recording player's bar (DESIGN §11 CallDetail, design/reference/Desk.html right panel). Props only.
// A 56 px haldi play button, a scrubber and the time left. The scrubber is a real range input laid over the
// track, so seeking works by touch, mouse and keyboard. With `bars` (loudness buckets computed from the
// audio) it draws them; without, a plain track: never a made-up waveform (D7).

export interface PlayerBarLabels {
  play: string;
  pause: string;
  seek: string;
}

export interface PlayerBarProps {
  playing: boolean;
  positionS: number;
  durationS: number;
  /** Loudness of the recording in buckets, 0–1 (computed from the audio, never invented). */
  bars?: number[];
  /** The recording is being fetched: the button says so and the time shows "…". */
  busy?: boolean;
  onToggle?: () => void;
  onSeek?: (s: number) => void;
  labels: PlayerBarLabels;
  /** Spoken while busy (the button's label). */
  busyLabel?: string;
}

export const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function PlayerBar({ playing, positionS, durationS, bars, busy = false, onToggle, onSeek, labels, busyLabel }: PlayerBarProps) {
  const duration = Math.max(1, durationS);
  const position = Math.min(Math.max(0, positionS), duration);
  const played = position / duration;
  return (
    <div className="flex items-center gap-3 rounded-card border border-rule bg-card p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={busy && busyLabel ? busyLabel : playing ? labels.pause : labels.play}
        aria-busy={busy || undefined}
        className="inline-flex size-14 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 border-ink bg-haldi active:scale-[0.97] motion-reduce:active:scale-100"
      >
        {playing ? <PauseBold className="size-6" /> : <PlayBold className={`size-6 ${busy ? "opacity-50" : ""}`} />}
      </button>
      <div className="relative flex h-10 min-w-0 flex-1 items-center gap-[3px] rounded-parchi has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ink has-[input:focus-visible]:outline">
        {bars && bars.length > 0 ? (
          bars.map((b, i) => (
            <span key={i} aria-hidden="true" className={`min-w-0 flex-1 rounded-full ${(i + 0.5) / bars.length <= played ? "bg-ink" : "bg-rule"}`} style={{ height: `${Math.round(20 + b * 80)}%` }} />
          ))
        ) : (
          <span aria-hidden="true" className="block h-2 w-full overflow-hidden rounded-full bg-rule">
            <span className="block h-full bg-ink" style={{ width: `${Math.round(played * 1000) / 10}%` }} />
          </span>
        )}
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={Math.floor(position)}
          onChange={(e) => onSeek?.(Number(e.target.value))}
          aria-label={labels.seek}
          aria-valuetext={`${mmss(position)} / ${mmss(duration)}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="shrink-0 font-mono text-meta tabular-nums">{busy ? "…" : mmss(durationS - positionS)}</span>
    </div>
  );
}
