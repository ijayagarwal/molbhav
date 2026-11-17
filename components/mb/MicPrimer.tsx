import { PrimaryButton, SecondaryButton } from "./Buttons";
import { KeyboardBold, MicBold } from "./icons";

// The mic permission primer (DESIGN §12.1, §20; DECISIONS V5). Props only; shown in a BottomSheet before
// the browser's own prompt, which is asked only from this card's button, never cold. When the browser can't
// be asked (blocked, no mic, not https, no recorder) the button is gone and the error says what to do;
// typing is always offered.

interface Props {
  body: string;
  /** A specific error (V5), shown instead of asking again. */
  error: string | null;
  allowLabel: string;
  typeLabel: string;
  busy?: boolean;
  /** Absent when asking again can't help (permission blocked, no device, insecure page). */
  onAllow?: () => void;
  onType: () => void;
}

export function MicPrimer({ body, error, allowLabel, typeLabel, busy = false, onAllow, onType }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-haldi">
          <MicBold className="size-7" />
        </span>
        <p className="text-body">{body}</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-card border-[1.5px] border-lal bg-card px-4 py-3 text-label text-lal">
          {error}
        </p>
      ) : null}
      {onAllow ? (
        <PrimaryButton icon={<MicBold className="size-6" />} onClick={onAllow} disabled={busy} aria-busy={busy}>
          {allowLabel}
        </PrimaryButton>
      ) : null}
      <SecondaryButton icon={<KeyboardBold className="size-5" />} onClick={onType}>
        {typeLabel}
      </SecondaryButton>
    </div>
  );
}
