// The browser's own voice for short lines (no key needed). The Confirm read-back moves to Sarvam in Phase 4.
/** Speaks a line with the browser's voice (no key needed); the read-back moves to Sarvam in Phase 4. */
export function speak(text: string, lang: "hi" | "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}
