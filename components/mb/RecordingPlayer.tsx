"use client";

import { useEffect, useRef, useState } from "react";
import { PauseBold, PlayBold, WarningBold } from "./icons";
import { mmss, PlayerBar, type PlayerBarLabels } from "./PlayerBar";

// RecordingPlayer (DESIGN §11 CallDetail, §12.7 item 5; DECISIONS B6). Plays one live call's stored
// recording in an <audio> element, from a 10-minute link that `load` fetches (media.recToken) on the first
// tap; the /rec route answers Range requests, so seeking works. Props only: the caller passes `load`.
// - "panel": the CallDetail player (56 px play button, scrubber, time left).
// - "row": a Result entry (design/reference/Result.html "▶ रिकॉर्डिंग"): name and meta, a 56 px button, and
//   once started a scrubber under it.
// Never a made-up waveform (D7). One recording plays at a time on a page. A link that expired while paused
// is fetched again; a refused reload (the token ran out mid-play) is retried once with a fresh link.

export interface RecordingLink {
  url: string;
  expiresAt: number;
}

export interface RecordingPlayerLabels extends PlayerBarLabels {
  /** The row button: "रिकॉर्डिंग सुनिए". */
  listen: string;
  loading: string;
  error: string;
}

interface Props {
  load: () => Promise<RecordingLink>;
  variant: "panel" | "row";
  labels: RecordingPlayerLabels;
  /** The call's length from Bolna, shown until the file's own duration is known. */
  durationHintS?: number;
  /** Row variant: the dealer's name and a meta line (round · length). */
  title?: string;
  meta?: string;
}

/** 10 ms of silence, played inside the tap: iOS lets an element play later only if play() ran in a gesture. */
const SILENCE =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
/** A link this close to its expiry is fetched again before playing. */
const LINK_MARGIN_MS = 30_000;

type Status = "idle" | "loading" | "playing" | "paused" | "error";

export function RecordingPlayer({ load, variant, labels, durationHintS, title, meta }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const link = useRef<RecordingLink | null>(null);
  const resumeAt = useRef(0);
  const retried = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(durationHintS ?? 0);

  const silent = () => (audio.current?.src ?? "").startsWith("data:");

  // One recording at a time; stop and drop the stream when the panel or row goes away.
  useEffect(() => {
    const el = audio.current;
    const onOtherPlay = (e: Event) => {
      if (e.target !== el && e.target instanceof HTMLMediaElement) el?.pause();
    };
    document.addEventListener("play", onOtherPlay, true);
    return () => {
      document.removeEventListener("play", onOtherPlay, true);
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
  }, []);

  async function start(freshLink: boolean) {
    const el = audio.current;
    if (!el) return;
    setStatus("loading");
    try {
      if (freshLink || link.current === null || Date.now() > link.current.expiresAt - LINK_MARGIN_MS) {
        link.current = await load();
        el.src = link.current.url;
        // Before the metadata arrives this sets the start position (HTML "default playback start position").
        if (resumeAt.current > 0) el.currentTime = resumeAt.current;
      }
      await el.play();
    } catch {
      setStatus("error");
    }
  }

  const toggle = () => {
    const el = audio.current;
    if (!el || status === "loading") return;
    if (status === "playing") {
      el.pause();
      return;
    }
    if (link.current === null) {
      el.src = SILENCE;
      void el.play().catch(() => {});
    }
    retried.current = false;
    void start(false);
  };

  const seek = (s: number) => {
    const el = audio.current;
    setPos(s);
    resumeAt.current = s;
    if (el && link.current !== null && !silent()) el.currentTime = s;
  };

  const element = (
    <audio
      ref={audio}
      preload="none"
      className="hidden"
      onPlaying={() => !silent() && setStatus("playing")}
      // A src swap queues a "pause" that can land after the outcome: it never hides a load or an error.
      onPause={() => !silent() && setStatus((s) => (s === "loading" || s === "error" ? s : "paused"))}
      onTimeUpdate={(e) => {
        if (silent()) return;
        setPos(e.currentTarget.currentTime);
        resumeAt.current = e.currentTarget.currentTime;
      }}
      onDurationChange={(e) => !silent() && Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
      onEnded={() => {
        resumeAt.current = 0;
        setStatus("paused");
      }}
      onError={() => {
        if (silent() || link.current === null) return;
        // Most likely the 10-minute link ran out while the browser fetched more: once, with a fresh one.
        if (!retried.current) {
          retried.current = true;
          void start(true);
        } else setStatus("error");
      }}
    />
  );

  const errorLine =
    status === "error" ? (
      <p role="alert" className="flex items-center gap-1 text-meta text-lal">
        <WarningBold className="size-3.5 shrink-0" />
        {labels.error}
      </p>
    ) : null;
  const live = (
    <span className="sr-only" role="status" aria-live="polite">
      {status === "loading" ? labels.loading : ""}
    </span>
  );

  if (variant === "panel") {
    return (
      <div className="flex flex-col gap-2">
        <PlayerBar
          playing={status === "playing"}
          positionS={pos}
          durationS={dur}
          busy={status === "loading"}
          busyLabel={labels.loading}
          onToggle={toggle}
          onSeek={seek}
          labels={labels}
        />
        {errorLine}
        {live}
        {element}
      </div>
    );
  }

  const started = status !== "idle";
  const duration = Math.max(1, dur);
  return (
    <div className="flex flex-col gap-2 border-t border-rule py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          {title ? <span className="truncate text-label">{title}</span> : null}
          {meta ? <span className="text-meta text-ink-2">{meta}</span> : null}
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-busy={status === "loading" || undefined}
          className="inline-flex min-h-14 shrink-0 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-card border-[1.5px] border-ink bg-card px-4 py-2 text-label text-ink transition-transform duration-100 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          {status === "playing" ? <PauseBold className="size-5" /> : <PlayBold className={`size-5 ${status === "loading" ? "opacity-50" : ""}`} />}
          {status === "playing" ? labels.pause : labels.listen}
        </button>
      </div>
      {started ? (
        <div className="flex items-center gap-3">
          <span className="relative flex h-14 min-w-0 flex-1 items-center rounded-parchi has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ink has-[input:focus-visible]:outline">
            <span aria-hidden="true" className="block h-2 w-full overflow-hidden rounded-full bg-rule">
              <span className="block h-full bg-ink" style={{ width: `${Math.round((Math.min(pos, duration) / duration) * 1000) / 10}%` }} />
            </span>
            <input
              type="range"
              min={0}
              max={duration}
              step={1}
              value={Math.floor(Math.min(pos, duration))}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label={labels.seek}
              aria-valuetext={`${mmss(pos)} / ${mmss(duration)}`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
          <span className="shrink-0 font-mono text-meta tabular-nums">{status === "loading" ? "…" : mmss(dur - pos)}</span>
        </div>
      ) : null}
      {errorLine}
      {live}
      {element}
    </div>
  );
}
