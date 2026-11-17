import type { ReactNode } from "react";
import { WarningBold } from "./icons";
import { PlayerBar } from "./PlayerBar";

// CallDetail (DESIGN §11, §19, design/reference/Desk.html right panel). Props only.
// A recording player (big play button and a scrubber), the transcript with speaker labels, and "What we
// understood" with "check kijiye" flags, marked "read back and confirmed" when the dealer said yes.
// Live mode shows the transcript only after the call (D7); the caller decides what to pass. A live call's
// stored recording comes in through `recording` (the lazily loaded RecordingPlayer); sim calls have none.

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
  /** Shown where the player goes when `player` is null: a live call's stored recording (Phase 8C). */
  recording?: ReactNode;
}

export function CallDetail({ meta, title, player, transcript, understood, readBackConfirmed, labels, recording }: Props) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <header className="flex flex-col gap-0.5">
        <span className="text-meta text-ink-2">{meta}</span>
        <h2 className="font-display text-title-2">{title}</h2>
      </header>

      {player ? (
        <PlayerBar
          playing={player.playing}
          positionS={player.positionS}
          durationS={player.durationS}
          bars={player.bars}
          onToggle={player.onToggle}
          onSeek={player.onSeek}
          labels={{ play: labels.play, pause: labels.pause, seek: labels.seek }}
        />
      ) : (recording ?? null)}

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
