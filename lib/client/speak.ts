// The browser's own voice for short lines (no key needed): Home's example, the spoken result, and the
// Confirm read-back's fallback when POST /api/tts can't answer (V3).

/** Speaks a line with the browser's voice. Returns false when the browser has no speech synthesis. */
export function speak(text: string, lang: "hi" | "en", opts: { onEnd?: () => void } = {}): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  u.rate = 0.95;
  if (opts.onEnd) {
    const end = opts.onEnd;
    u.onend = () => end();
    u.onerror = () => end();
  }
  window.speechSynthesis.speak(u);
  return true;
}

/** Stops whatever the browser is saying (V3: the read-back is always interruptible). */
export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
