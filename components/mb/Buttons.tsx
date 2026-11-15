import type { ButtonHTMLAttributes, ReactNode } from "react";

// PrimaryButton and SecondaryButton (DESIGN §11, §20). Props only.
// Primary: full width, 64 px, haldi fill, ink label, painted ink shadow, icon left; pressing collapses the
// shadow so the button "presses into paper". Secondary: 56 px, card fill, 1.5 px ink border.

type Base = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { icon?: ReactNode; children: ReactNode };

export function PrimaryButton({ icon, children, className, type = "button", ...rest }: Base) {
  return (
    <button
      type={type}
      className={`press-paint inline-flex h-16 w-full touch-manipulation items-center justify-center gap-2 rounded-card border-2 border-ink bg-haldi px-5 font-display text-title-2 text-ink shadow-paint disabled:cursor-not-allowed disabled:border-rule disabled:bg-cement disabled:text-ink-2 disabled:shadow-none ${className ?? ""}`}
      {...rest}
    >
      {icon ? <span className="inline-flex size-6 shrink-0 items-center justify-center">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function SecondaryButton({ icon, children, className, type = "button", tone = "ink", ...rest }: Base & { tone?: "ink" | "lal" }) {
  const toneClass = tone === "lal" ? "border-lal text-lal" : "border-ink text-ink";
  return (
    <button
      type={type}
      className={`inline-flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-card border-[1.5px] bg-card px-4 text-label transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-3 ${toneClass} ${className ?? ""}`}
      {...rest}
    >
      {icon ? <span className="inline-flex size-5 shrink-0 items-center justify-center">{icon}</span> : null}
      {children}
    </button>
  );
}
