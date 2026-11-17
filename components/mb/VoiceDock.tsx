import { forwardRef, type FormEvent, type ReactNode } from "react";
import { PrimaryButton, SecondaryButton } from "./Buttons";
import { KeyboardBold } from "./icons";

// Key caps are key names, not copy.
const SPACE_KEY = "Space";

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

/** A take in progress, shown in the desk dock instead of a full-screen sheet (V1 on desk, review of 2B). */
export interface DockTake {
  /** "सुन रहे हैं… 0:07" or "समझ रहे हैं…", announced politely. */
  status: string;
  levels: number[];
  /** Locked takes show a 56 px रद्द and a visible send (V1). */
  locked: boolean;
  cancelLabel: string;
  sendLabel: string;
  onCancel: () => void;
  onSend: () => void;
}

interface DeskDockProps {
  mic: ReactNode;
  label: string;
  placeholder: string;
  holdLabel: string;
  typeLabel: string;
  /** Show the Space hint only while single-key shortcuts are on (WCAG 2.1.4). */
  spaceHint: boolean;
  /** "⌘K" on a Mac, "Ctrl K" elsewhere. */
  composerKey: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  take?: DockTake | null;
}

/**
 * Desk: a 64 px mic and the typed composer ("New order: speak or type"), with the Space and ⌘K hints.
 * The container is focusable (tabIndex -1): focus on it counts as "on the dock" for push-to-talk (V6),
 * and it shows the focus ring so it is clear Space will work there.
 */
export const DeskVoiceDock = forwardRef<HTMLDivElement, DeskDockProps>(function DeskVoiceDock(
  { mic, label, placeholder, holdLabel, typeLabel, spaceHint, composerKey, value, onChange, onSubmit, inputRef, take },
  ref,
) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit();
  };
  return (
    <div ref={ref} tabIndex={-1} className="mx-auto flex w-full max-w-[840px] items-end gap-4 rounded-card px-6 py-4">
      {mic}
      {take ? (
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-label">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-lal" />
              {take.status}
            </p>
            <div aria-hidden="true" className="flex h-8 items-center gap-1.5">
              {take.levels.map((l, i) => (
                <span key={i} className="w-1.5 rounded-full bg-ink" style={{ height: `${Math.round(6 + Math.min(1, l) * 26)}px` }} />
              ))}
            </div>
          </div>
          {take.locked ? (
            <div className="flex shrink-0 gap-3">
              <SecondaryButton onClick={take.onCancel}>{take.cancelLabel}</SecondaryButton>
              <PrimaryButton size="md" className="w-auto" onClick={take.onSend}>
                {take.sendLabel}
              </PrimaryButton>
            </div>
          ) : null}
        </div>
      ) : (
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
                <kbd className="rounded-parchi border border-ink bg-card px-1.5 font-mono text-meta text-ink">{composerKey}</kbd>
                {typeLabel}
              </span>
            </span>
          </div>
        </form>
      )}
    </div>
  );
});
