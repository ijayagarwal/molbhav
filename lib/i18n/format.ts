/** Fills {name} placeholders: format("₹{x} कम", { x: "5,470" }) → "₹5,470 कम". Unknown placeholders stay visible. */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** A short day and month in IST ("12 नव॰" / "12 Nov"), with Western digits (hard rule 9). */
export function formatDate(ms: number, lang: "hi" | "en"): string {
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN-u-nu-latn" : "en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(ms);
}
