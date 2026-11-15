import { forwardRef, type FormEvent, type ReactNode } from "react";
import { KeyboardBold } from "./icons";

// Key caps are key names, not copy.
const SPACE_KEY = "Space";
const COMPOSER_KEY = "⌘K";

// The voice docks (DESIGN §12.2, §19, Main.html, Desk.html). Props only.

/** Phone: the 88 px mic centred at the bottom, its label, and "लिख के बताइए". */
export function PhoneVoiceDock({ mic, micHint, typeLabel, onType, banner }: { mic: ReactNode; micHint: string; typeLabel: string; onType?: () => void; banner?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {banner ? <div className="w-full">{banner}</div> : null}
      {mic}
      <span className="text-label">{micHint}</span>
      <button type="button" onClick={onType} className="inline-flex min-h-14 items-center gap-2 px-3 text-label text-ink-2 underline underline-offset-4">
        <KeyboardBold className="size-5" />
        {typeLabel}
      </button>
    </div>
  );
}

interface DeskDockProps {
  mic: ReactNode;
  label: string;
  placeholder: string;
  holdLabel: string;
  typeLabel: string;
  /** Show the Space hint only while single-key shortcuts are on (WCAG 2.1.4). */
  spaceHint: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Desk: a 64 px mic and the typed composer ("New order: speak or type"), with the Space and ⌘K hints.
 * The container is focusable (tabIndex -1): focus on it counts as "on the dock" for push-to-talk (V6).
 */
export const DeskVoiceDock = forwardRef<HTMLDivElement, DeskDockProps>(function DeskVoiceDock(
  { mic, label, placeholder, holdLabel, typeLabel, spaceHint, value, onChange, onSubmit, inputRef },
  ref,
) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit();
  };
  return (
    <div ref={ref} tabIndex={-1} className="mx-auto flex w-full max-w-[840px] items-end gap-4 px-6 py-4 outline-none">
      {mic}
      <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor="composer" className="text-label">
          {label}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="composer"
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            enterKeyHint="send"
            className="h-14 min-w-0 flex-1 rounded-card border-[1.5px] border-ink bg-card px-4 text-body placeholder:text-ink-3"
          />
          <span className="hidden shrink-0 items-center gap-3 text-meta text-ink-2 xl:flex">
            {spaceHint ? (
              <span className="flex items-center gap-1.5">
                <kbd className="rounded-parchi border border-ink bg-card px-1.5 font-mono text-meta text-ink">{SPACE_KEY}</kbd>
                {holdLabel}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-parchi border border-ink bg-card px-1.5 font-mono text-meta text-ink">{COMPOSER_KEY}</kbd>
              {typeLabel}
            </span>
          </span>
        </div>
      </form>
    </div>
  );
});
