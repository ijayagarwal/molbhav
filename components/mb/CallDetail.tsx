import { PauseBold, PlayBold, WarningBold } from "./icons";

// CallDetail (DESIGN §11, §19, design/reference/Desk.html right panel). Props only.
// A recording player (big play button and a scrubber), the transcript with speaker labels, and "What we
// understood" with "check kijiye" flags, marked "read back and confirmed" when the dealer said yes.
// Live mode shows the transcript only after the call (D7); the caller decides what to pass.

export interface CallPlayer {
  playing: boolean;
  positionS: number;
  durationS: number;
  /** Loudness of the recording in buckets, 0–1 (computed from the audio, never invented). */
  bars: number[];
  onToggle?: () => void;
  onSeek?: (s: number) => void;
}

export interface CallLine {
  speaker: "agent" | "dealer";
  text: string;
}

export interface UnderstoodField {
  label: string;
  value: string;
  /** "चेक कीजिए": the field needs a look. */
  flag?: string;
}

export interface CallDetailLabels {
  agent: string;
  dealer: string;
  understood: string;
  readBack: string;
  notReadBack: string;
  play: string;
  pause: string;
  seek: string;
}

interface Props {
  meta: string;
  title: string;
  player: CallPlayer | null;
  transcript: CallLine[];
  understood: UnderstoodField[] | null;
  readBackConfirmed: boolean;
  labels: CallDetailLabels;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function CallDetail({ meta, title, player, transcript, understood, readBackConfirmed, labels }: Props) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <header className="flex flex-col gap-0.5">
        <span className="text-meta text-ink-2">{meta}</span>
        <h2 className="font-display text-title-2">{title}</h2>
      </header>

      {player ? (
        <div className="flex items-center gap-3 rounded-card border border-rule bg-card p-3">
          <button
            type="button"
            onClick={player.onToggle}
            aria-label={player.playing ? labels.pause : labels.play}
            className="inline-flex size-14 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 border-ink bg-haldi active:scale-[0.97]"
          >
            {player.playing ? <PauseBold className="size-6" /> : <PlayBold className="size-6" />}
          </button>
          <div className="relative flex h-10 min-w-0 flex-1 items-center gap-[3px]">
            {player.bars.map((b, i) => {
              const played = (i + 0.5) / player.bars.length <= player.positionS / Math.max(1, player.durationS);
              return <span key={i} aria-hidden="true" className={`min-w-0 flex-1 rounded-sm ${played ? "bg-ink" : "bg-rule"}`} style={{ height: `${Math.round(20 + b * 80)}%` }} />;
            })}
            {/* The real control: a range input over the bars, so seeking works by touch, mouse and keyboard. */}
            <input
              type="range"
              min={0}
              max={Math.max(1, player.durationS)}
              step={1}
              value={Math.min(player.positionS, player.durationS)}
              onChange={(e) => player.onSeek?.(Number(e.target.value))}
              aria-label={labels.seek}
              aria-valuetext={`${mmss(player.positionS)} / ${mmss(player.durationS)}`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <span className="shrink-0 font-mono text-meta tabular-nums">{mmss(player.durationS - player.positionS)}</span>
        </div>
      ) : null}

      {transcript.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {transcript.map((l, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <span className={`text-meta font-ui-semibold ${l.speaker === "agent" ? "text-neel" : "text-ink-2"}`}>{l.speaker === "agent" ? labels.agent : labels.dealer}</span>
              <p className="text-body">{l.text}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {understood ? (
        <div className="flex flex-col gap-3 border-t border-rule pt-3">
          <p className="text-label">
            {labels.understood}
            <span className={readBackConfirmed ? "text-hara" : "text-lal"}> · {readBackConfirmed ? labels.readBack : labels.notReadBack}</span>
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {understood.map((f) => (
              <div key={f.label} className="flex min-w-0 flex-col">
                <dt className="text-meta text-ink-2">{f.label}</dt>
                <dd className="text-label">{f.value}</dd>
                {f.flag ? (
                  <dd className="flex items-center gap-1 text-meta text-lal">
                    <WarningBold className="size-3.5" />
                    {f.flag}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
