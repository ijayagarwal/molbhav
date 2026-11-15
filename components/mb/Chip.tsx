// Chip and TierChips (DESIGN §11, R8, R10). Props only.
// Chip: 56 px tall minimum, 16 px padding, radius 12. Selected: ink fill, paper text, aria-pressed.
// An unanswered required choice: a 2 px dashed lal border and lal text ending in "?".

interface ChipProps {
  label: string;
  selected?: boolean;
  /** An unanswered required choice (shows "?"). */
  required?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function Chip({ label, selected = false, required = false, onClick, disabled }: ChipProps) {
  const text = required && !selected && !label.endsWith("?") ? `${label}?` : label;
  const look = selected
    ? "border-[1.5px] border-ink bg-ink text-paper"
    : required
      ? "border-2 border-dashed border-lal bg-card text-lal"
      : "border-[1.5px] border-ink bg-card text-ink";
  const cls = `inline-flex min-h-14 items-center justify-center rounded-card px-4 text-label ${look}`;
  if (!onClick) return <span className={cls}>{text}</span>;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={`${cls} touch-manipulation transition-transform duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {text}
    </button>
  );
}

export interface TierOption {
  value: string;
  label: string;
}

/**
 * Steel: "कौन सा सरिया?" [ब्रांडेड] [लोकल ISI] ("दोनों" is P1, R10). Cement: [नामी कंपनी] [कोई भी],
 * pre-selected from the last choice or कोई भी (R8). With nothing chosen, every option shows as required.
 */
export function TierChips({ question, options, value, onChange }: { question: string; options: TierOption[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={question} className="flex flex-col gap-2">
      <span className="text-label text-ink-2">{question}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={value === o.value} required={value === null} onClick={() => onChange(o.value)} />
        ))}
      </div>
    </div>
  );
}
