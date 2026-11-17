import type { ButtonHTMLAttributes, ReactNode } from "react";

// PrimaryButton and SecondaryButton (DESIGN §11, §20). Props only.
// Primary: full width, 64 px, haldi fill, ink label, painted ink shadow, icon left; pressing collapses the
// shadow so the button "presses into paper". Secondary: 56 px, card fill, 1.5 px ink border.

type Base = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { icon?: ReactNode; children: ReactNode };

export function PrimaryButton({ icon, children, className, type = "button", size = "lg", ...rest }: Base & { size?: "lg" | "md" }) {
  // lg: the 64 px screen action (DESIGN §11). md: 56 px, for a primary inside a sheet or the desk dock.
  const sizing = size === "lg" ? "h-16 w-full px-5 font-display text-title-2" : "h-14 px-4 text-label";
  return (
    <button
      type={type}
      className={`press-paint inline-flex touch-manipulation items-center justify-center gap-2 rounded-card border-2 border-ink bg-haldi text-ink shadow-paint disabled:cursor-not-allowed disabled:border-rule disabled:bg-cement disabled:text-ink-2 disabled:shadow-none ${sizing} ${className ?? ""}`}
      {...rest}
    >
      {icon ? <span className="inline-flex size-6 shrink-0 items-center justify-center">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function SecondaryButton({ icon, children, className, type = "button", tone = "ink", ref, ...rest }: Base & { tone?: "ink" | "lal"; ref?: React.Ref<HTMLButtonElement> }) {
  const toneClass = tone === "lal" ? "border-lal text-lal" : "border-ink text-ink";
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-card border-[1.5px] bg-card px-4 text-label transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-3 ${toneClass} ${className ?? ""}`}
      {...rest}
    >
      {icon ? <span className="inline-flex size-5 shrink-0 items-center justify-center">{icon}</span> : null}
      {children}
    </button>
  );
}
