// WhatsApp click-to-chat (G1, G5), only when NEXT_PUBLIC_WHATSAPP_NUMBER is set: with no team number this
// renders nothing, never a broken link. Server component; the icon is Phosphor's WhatsappLogo, Bold (MIT),
// inlined here until it joins components/mb/icons.tsx through `pnpm icons:bold`.
import { whatsappLink } from "./contact";

const WHATSAPP_BOLD =
  "M187.3,159.06A36.09,36.09,0,0,1,152,188a84.09,84.09,0,0,1-84-84A36.09,36.09,0,0,1,96.94,68.7,12,12,0,0,1,110,75.1l11.48,23a12,12,0,0,1-.75,12l-8.52,12.78a44.56,44.56,0,0,0,20.91,20.91l12.78-8.52a12,12,0,0,1,12-.75l23,11.48A12,12,0,0,1,187.3,159.06ZM236,128A108,108,0,0,1,78.77,224.15L46.34,235A20,20,0,0,1,21,209.66l10.81-32.43A108,108,0,1,1,236,128Zm-24,0A84,84,0,1,0,55.27,170.06a12,12,0,0,1,1,9.81l-9.93,29.79,29.79-9.93a12.1,12.1,0,0,1,3.8-.62,12,12,0,0,1,6,1.62A84,84,0,0,0,212,128Z";

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d={WHATSAPP_BOLD} />
    </svg>
  );
}

const STYLES = {
  /** Haldi fill, ink border and painted shadow: the main action in the waitlist band on phones. */
  primary: "press-paint min-h-16 w-full justify-center border-2 border-ink bg-haldi px-5 font-display text-title-2 text-ink shadow-paint lg:w-fit",
  /** Card fill with an ink border, beside the hero CTA. */
  secondary: "min-h-16 justify-center border-[1.5px] border-ink bg-card px-5 text-label text-ink",
  /** Paper outline on an ink band. */
  onInk: "min-h-14 border-2 border-paper px-4 text-label text-paper",
  /** Icon only (header); the label is the accessible name. */
  icon: "size-14 justify-center border-[1.5px] border-ink bg-card text-ink",
} as const;

export function WhatsAppLink({ text, label, variant, className }: { text: string; label: string; variant: keyof typeof STYLES; className?: string }) {
  const href = whatsappLink(text);
  if (href === null) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={variant === "icon" ? label : undefined}
      className={`inline-flex items-center gap-3 rounded-card ${STYLES[variant]} ${className ?? ""}`}
    >
      <WhatsAppIcon className={variant === "primary" ? "size-6 shrink-0" : "size-5 shrink-0"} />
      {variant === "icon" ? null : <span className="text-balance">{label}</span>}
    </a>
  );
}
