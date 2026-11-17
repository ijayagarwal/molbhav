// Earcons (docs/DESIGN.md §10): generated with Web Audio, no audio files, all under 200 ms and modest.
//   tik  mic open (short high click)   ·  tok   mic close (lower)
//   thap quote stamped (soft low thud)  ·  ching winner (two quick bright notes)
// Browsers allow audio only after a user gesture: call resumeAudio() inside a tap (V2).

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function isSoundEnabled() {
  return enabled;
}

/** Create or resume the AudioContext. Call from a tap handler. */
export function resumeAudio() {
  if (typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
}

/**
 * The one AudioContext of the page (earcons and the mic's level meter share it; iOS limits how many a
 * page may open). resumeAudio() inside the tap creates and resumes it; null where Web Audio is missing.
 */
export function audioContext(): AudioContext | null {
  if (ctx === null) resumeAudio();
  return ctx;
}

function tone(freq: number, durationS: number, opts: { type?: OscillatorType; gain?: number; endFreq?: number; delayS?: number } = {}) {
  if (!enabled || ctx === null || ctx.state !== "running") return;
  const t0 = ctx.currentTime + (opts.delayS ?? 0);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + durationS);
  const peak = opts.gain ?? 0.12;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationS + 0.02);
}

export const earcons = {
  tik: () => tone(1900, 0.045, { type: "triangle", gain: 0.08 }),
  tok: () => tone(950, 0.06, { type: "triangle", gain: 0.08 }),
  thap: () => tone(170, 0.14, { type: "sine", gain: 0.22, endFreq: 70 }),
  ching: () => {
    tone(1320, 0.09, { type: "sine", gain: 0.1 });
    tone(1760, 0.12, { type: "sine", gain: 0.1, delayS: 0.08 });
  },
};
