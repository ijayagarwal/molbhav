// Form building blocks for the waitlist and the dealer opt-in (DESIGN §7, §15): 56 px targets, 1.5 px ink
// borders, 12 px radius, the error as an icon plus words in lal (never colour alone), labels always visible.
// Presentational, props only.
import type { ReactNode, Ref } from "react";
import { CheckBold, DownBold, WarningBold } from "@/components/mb/icons";

export const inputClass =
  "h-14 w-full min-w-0 rounded-card border-[1.5px] border-ink bg-card px-3 text-body text-ink placeholder:text-ink-3 aria-[invalid=true]:border-2 aria-[invalid=true]:border-lal";

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p id={id} className="flex items-start gap-2 text-label text-lal">
      <WarningBold className="mt-0.5 size-5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function Field({ id, label, error, children, className }: { id: string; label: string; error: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      {children}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

/** A native select with our chevron (the browser's own arrow differs per phone). */
export function SelectBox({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...rest} className={`${inputClass} appearance-none pr-10`}>
        {children}
      </select>
      <DownBold aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2" />
    </span>
  );
}

/** One radio or checkbox drawn as a chip; the tick icon marks the chosen one (not colour alone). */
export function ChoiceChip({ type, name, value, checked, onChange, label, invalid, describedBy, field }: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  invalid?: boolean;
  describedBy?: string;
  field?: string;
}) {
  return (
    <label className="group inline-flex min-h-14 cursor-pointer items-center gap-2 rounded-card border-[1.5px] border-ink bg-card px-4 text-label has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-field={field}
        className="sr-only"
      />
      <CheckBold aria-hidden="true" className="hidden size-5 shrink-0 group-has-[:checked]:inline" />
      <span>{label}</span>
    </label>
  );
}

/** The required consent box with its notice above it (S4). */
export function ConsentBox({ id, notice, label, checked, onChange, error, link }: {
  id: string;
  notice: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error: string | null;
  link: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta text-ink-2">{notice}</p>
      {link}
      <label htmlFor={id} className="flex min-h-14 cursor-pointer items-start gap-3 py-2 text-body">
        <input
          id={id}
          type="checkbox"
          name="consent"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? `${id}-err` : undefined}
          data-field="consent"
          className="mt-0.5 size-6 shrink-0 accent-ink"
        />
        <span>{label}</span>
      </label>
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

/** A form-level error (rate limit, our side), focused so a screen reader reads it at once. */
export function FormAlert({ ref, message, className }: { ref: Ref<HTMLParagraphElement>; message: string; className?: string }) {
  return (
    <p ref={ref} tabIndex={-1} role="alert" className={`flex items-start gap-2 text-label text-lal ${className ?? ""}`}>
      <WarningBold aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/** The thank-you that replaces a sent form. */
export function FormDone({ title, body }: { title: string; body: string }) {
  return (
    <div role="status" className="flex flex-col items-start gap-3 rounded-card border-2 border-hara bg-card p-5">
      <span className="flex items-center gap-2 font-display text-title-2 text-hara">
        <CheckBold aria-hidden="true" className="size-6 shrink-0" />
        {title}
      </span>
      <p className="text-body text-ink">{body}</p>
    </div>
  );
}
